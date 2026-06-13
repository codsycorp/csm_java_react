package web

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"

	"csm_server/backend-go/internal/state"
)

const (
	maxMultipartUpload = 32 * 1024 * 1024
	maxBase64Upload    = 8 * 1024 * 1024
	maxBodyRead        = 10 * 1024 * 1024
)

func HandleUpload(st *state.AppState, w http.ResponseWriter, r *http.Request) {
	uploadDir := filepath.Join(st.Config.DataDir, "public", "app_images", "uploads")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	if err := r.ParseMultipartForm(maxMultipartUpload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}

	var saved []map[string]any
	for _, headers := range r.MultipartForm.File {
		for _, fh := range headers {
			origName := fh.Filename
			ext := "bin"
			if i := strings.LastIndex(origName, "."); i >= 0 {
				ext = origName[i+1:]
			}
			id := uuid.New().String()
			filename := id + "." + ext
			path := filepath.Join(uploadDir, filename)
			if err := saveMultipartFile(fh, path); err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
				return
			}
			saved = append(saved, map[string]any{
				"originalName": origName,
				"path":         "app_images/uploads/" + filename,
				"size":         fh.Size,
			})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "files": saved})
}

func HandleUploadSHTML(st *state.AppState, w http.ResponseWriter, r *http.Request) {
	query := r.URL.RawQuery
	appID := QSParam(query, "app_id")
	nameParam := QSParam(query, "name")
	if strings.Contains(appID, "..") || strings.Contains(nameParam, "..") {
		writeJSONError(w, "Invalid path")
		return
	}

	ct := r.Header.Get("Content-Type")
	uploadRoot := filepath.Join(st.Config.DataDir, "public", "app_images", appID)
	if err := os.MkdirAll(uploadRoot, 0o755); err != nil {
		writeJSONError(w, "Cannot create upload dir: "+err.Error())
		return
	}

	if strings.Contains(ct, "multipart/form-data") {
		handleUploadMultipart(st, w, r, appID, nameParam, uploadRoot)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodyRead))
	if err != nil {
		writeJSONError(w, "Request body too large or unreadable")
		return
	}
	bodyStr := string(body)

	var src, link, fileName string
	if strings.Contains(ct, "application/json") {
		var payload map[string]string
		if json.Unmarshal(body, &payload) == nil {
			src = payload["src"]
			link = payload["link"]
			fileName = payload["name"]
		}
	} else {
		src = qsValFromBody(bodyStr, "src")
		link = qsValFromBody(bodyStr, "link")
		fileName = qsValFromBody(bodyStr, "name")
	}
	if fileName == "" {
		fileName = nameParam
	}

	if src != "" {
		handleUploadBase64(w, appID, fileName, src, uploadRoot)
		return
	}
	if link != "" {
		handleUploadLink(st, w, appID, fileName, link, uploadRoot)
		return
	}
	writeJSONError(w, "No file data provided (need multipart, base64 src, or link)")
}

func handleUploadMultipart(st *state.AppState, w http.ResponseWriter, r *http.Request, appID, nameParam, uploadRoot string) {
	if err := r.ParseMultipartForm(maxMultipartUpload); err != nil {
		writeJSONError(w, "Cannot parse multipart: "+err.Error())
		return
	}
	for _, headers := range r.MultipartForm.File {
		for _, fh := range headers {
			if fh.Size > maxMultipartUpload {
				http.Error(w, "File quá lớn. Giới hạn: 32MB", http.StatusRequestEntityTooLarge)
				return
			}
			origName := fh.Filename
			fileName := origName
			if nameParam != "" {
				fileName = nameParam
			}
			safeName := sanitizeFilename(fileName)
			path := filepath.Join(uploadRoot, safeName)
			if err := saveMultipartFile(fh, path); err != nil {
				writeJSONError(w, "Cannot save file: "+err.Error())
				return
			}
			fileURL := fmt.Sprintf("app_images/%s/%s", appID, safeName)
			writeJSON(w, http.StatusOK, map[string]any{"path": fileURL})
			return
		}
	}
	writeJSONError(w, "No file field in multipart body")
}

func handleUploadBase64(w http.ResponseWriter, appID, fileName, src, uploadRoot string) {
	if fileName == "" {
		writeJSONError(w, "Tên file là bắt buộc khi upload base64")
		return
	}
	commaPos := strings.Index(src, ",")
	if commaPos < 0 {
		writeJSONError(w, "Dữ liệu base64 không hợp lệ")
		return
	}
	b64Data := strings.TrimSpace(src[commaPos+1:])
	if (len(b64Data)*3)/4 > maxBase64Upload {
		http.Error(w, "File quá lớn. Giới hạn: 8MB cho base64 upload.", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := base64.StdEncoding.DecodeString(b64Data)
	if err != nil {
		writeJSONError(w, "Dữ liệu Base64 không hợp lệ")
		return
	}
	safeName := sanitizeFilename(fileName)
	dest := filepath.Join(uploadRoot, safeName)
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		writeJSONError(w, "Cannot save file: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": fmt.Sprintf("app_images/%s/%s", appID, safeName)})
}

func handleUploadLink(st *state.AppState, w http.ResponseWriter, appID, fileName, link, uploadRoot string) {
	if fileName == "" {
		writeJSONError(w, "Tên file là bắt buộc khi upload từ link")
		return
	}
	if !strings.HasPrefix(link, "http://") && !strings.HasPrefix(link, "https://") {
		writeJSONError(w, "Link không hợp lệ")
		return
	}
	resp, err := st.HTTPClient.Get(link)
	if err != nil {
		writeJSONError(w, "Cannot download from link: "+err.Error())
		return
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxMultipartUpload+1))
	if err != nil {
		writeJSONError(w, "Cannot read download response: "+err.Error())
		return
	}
	if len(data) > maxMultipartUpload {
		http.Error(w, "File từ link quá lớn. Giới hạn: 32MB.", http.StatusRequestEntityTooLarge)
		return
	}
	safeName := sanitizeFilename(fileName)
	dest := filepath.Join(uploadRoot, safeName)
	if err := os.WriteFile(dest, data, 0o644); err != nil {
		writeJSONError(w, "Cannot save file: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"path": fmt.Sprintf("app_images/%s/%s", appID, safeName)})
}

func saveMultipartFile(fh *multipart.FileHeader, path string) error {
	src, err := fh.Open()
	if err != nil {
		return err
	}
	defer src.Close()
	dst, err := os.Create(path)
	if err != nil {
		return err
	}
	defer dst.Close()
	_, err = io.Copy(dst, src)
	return err
}

func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	var b strings.Builder
	lastDash := false
	for _, c := range name {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '.' || c == '-' || c == '_' {
			b.WriteRune(c)
			lastDash = false
		} else if !lastDash {
			b.WriteRune('-')
			lastDash = true
		}
	}
	result := b.String()
	if result == "" {
		return "upload-" + uuid.New().String()
	}
	return result
}

func qsValFromBody(body, key string) string {
	for _, part := range strings.Split(body, "&") {
		k, v, ok := strings.Cut(part, "=")
		if ok && strings.TrimSpace(k) == key {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
