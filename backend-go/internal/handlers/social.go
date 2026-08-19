package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/model"
	"csm_server/backend-go/internal/security"
)

const fbGraphBase = "https://graph.facebook.com/v18.0"

type SocialHandler struct {
	cfg        config.AppConfig
	httpClient *http.Client
	crm        *CrmHandler
}

func NewSocialHandler(cfg config.AppConfig, httpClient *http.Client, crm *CrmHandler) *SocialHandler {
	return &SocialHandler{cfg: cfg, httpClient: httpClient, crm: crm}
}

func (h *SocialHandler) HandleFacebookPost(params map[string]any) *model.StandardResponse {
	pageID := paramStr(params, "pageId")
	pageToken := paramStr(params, "pageAccessToken")
	message := paramStr(params, "message")
	if pageID == "" || pageToken == "" {
		return fbErr(400, "Missing pageId or pageAccessToken")
	}
	if message == "" {
		return fbErr(400, "Missing message")
	}
	imageURL := paramStr(params, "imageUrl")
	link := paramStr(params, "link")

	var fbURL string
	payload := map[string]any{}
	if imageURL != "" {
		fbURL = fmt.Sprintf("%s/%s/photos", fbGraphBase, pageID)
		payload = map[string]any{
			"url": imageURL, "caption": message, "access_token": pageToken,
		}
	} else {
		fbURL = fmt.Sprintf("%s/%s/feed", fbGraphBase, pageID)
		payload = map[string]any{
			"message": message, "access_token": pageToken,
		}
	}
	if link != "" {
		payload["link"] = link
	}
	body, err := h.facebookPostJSON(fbURL, payload)
	if err != nil {
		return fbErr(500, "Error: "+err.Error())
	}
	postID := ""
	if id, ok := body["id"].(string); ok {
		postID = id
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("message", "Post published successfully")
	r.Set("data", map[string]any{"post_id": postID, "pageId": pageID})
	return r
}

func (h *SocialHandler) HandleFacebookPostWithImages(params map[string]any) *model.StandardResponse {
	pageID := paramStr(params, "pageId")
	pageToken := paramStr(params, "pageAccessToken")
	message := paramStr(params, "message")
	if pageID == "" || pageToken == "" {
		return fbErr(400, "Missing pageId or pageAccessToken")
	}
	if message == "" {
		return fbErr(400, "Missing message")
	}
	link := paramStr(params, "link")
	images := sanitizeImages(stringList(params, "images"))
	videos := sanitizeVideos(stringList(params, "videos"))

	var mainPostID string
	extraPostIDs := []string{}
	imagesPosted, videosPosted := 0, 0
	var videoFailureReason string

	for _, videoInput := range videos {
		videoURL := fmt.Sprintf("%s/%s/videos", fbGraphBase, pageID)
		videoDesc := message
		if link != "" && !strings.Contains(videoDesc, link) {
			videoDesc += "\n\n" + link
		}
		var videoPostID string
		if strings.HasPrefix(videoInput, "data:video/") || !strings.HasPrefix(videoInput, "http") {
			bytesData := h.loadBytesFromInput(videoInput)
			if len(bytesData) == 0 {
				if videoFailureReason == "" {
					videoFailureReason = "Invalid base64 video payload"
				}
				continue
			}
			body, err := h.facebookPostMultipart(videoURL, map[string]string{
				"description":  videoDesc,
				"access_token": pageToken,
			}, "source", "video.mp4", "video/mp4", bytesData)
			if err == nil {
				videoPostID, _ = body["id"].(string)
			}
		} else {
			body, err := h.facebookPostForm(videoURL, map[string]string{
				"file_url": videoInput, "description": videoDesc, "access_token": pageToken,
			})
			if err == nil {
				videoPostID, _ = body["id"].(string)
			} else if videoFailureReason == "" {
				videoFailureReason = fmt.Sprintf("Cannot download or upload video URL: %s", videoInput)
			}
		}
		if videoPostID != "" {
			if mainPostID == "" {
				mainPostID = videoPostID
			} else {
				extraPostIDs = append(extraPostIDs, videoPostID)
			}
			videosPosted++
		}
	}

	if len(videos) > 0 && len(images) == 0 && videosPosted == 0 {
		r := model.NewResponse()
		r.Set("code", 502)
		r.Set("success", false)
		r.Set("message", "Video upload failed. Post was not published to avoid text-only fallback.")
		reason := videoFailureReason
		if reason == "" {
			reason = "Video upload failed"
		}
		r.Set("data", map[string]any{
			"pageId": pageID, "videos_count": 0, "images_count": 0, "reason": reason,
		})
		return r
	}

	if len(images) > 0 {
		photoURL := fmt.Sprintf("%s/%s/photos", fbGraphBase, pageID)
		mediaIDs := []string{}
		for _, imageURL := range images {
			bytesData := h.loadBytesFromInput(imageURL)
			if len(bytesData) == 0 {
				continue
			}
			body, err := h.facebookPostMultipart(photoURL, map[string]string{
				"published": "false", "access_token": pageToken,
			}, "source", "image.jpg", "image/jpeg", bytesData)
			if err == nil {
				if id, ok := body["id"].(string); ok && id != "" {
					mediaIDs = append(mediaIDs, id)
				}
			}
		}
		if len(mediaIDs) > 0 {
			feedURL := fmt.Sprintf("%s/%s/feed", fbGraphBase, pageID)
			photoMessage := message
			if mainPostID != "" {
				photoMessage += "\n\n📷 Bộ ảnh minh họa bổ sung cho video ở trên."
			}
			form := map[string]string{"message": photoMessage, "access_token": pageToken}
			for i, mediaID := range mediaIDs {
				form[fmt.Sprintf("attached_media[%d]", i)] = fmt.Sprintf(`{"media_fbid":"%s"}`, mediaID)
			}
			body, err := h.facebookPostForm(feedURL, form)
			if err == nil {
				imagesPosted = len(mediaIDs)
				if pid, ok := body["id"].(string); ok && pid != "" {
					if mainPostID == "" {
						mainPostID = pid
					} else {
						extraPostIDs = append(extraPostIDs, pid)
					}
				}
			}
		}
	}

	if mainPostID == "" {
		if len(images) > 0 {
			fbURL := fmt.Sprintf("%s/%s/photos", fbGraphBase, pageID)
			payload := map[string]any{
				"url": images[0], "caption": message, "access_token": pageToken,
			}
			if body, err := h.facebookPostJSON(fbURL, payload); err == nil {
				if pid, ok := body["id"].(string); ok {
					mainPostID = pid
					imagesPosted = 1
				}
			}
		}
		if mainPostID == "" {
			fbURL := fmt.Sprintf("%s/%s/feed", fbGraphBase, pageID)
			payload := map[string]any{"message": message, "access_token": pageToken}
			if link != "" {
				payload["link"] = link
			}
			body, err := h.facebookPostJSON(fbURL, payload)
			if err != nil {
				return fbErr(500, "Error: "+err.Error())
			}
			mainPostID, _ = body["id"].(string)
		}
	}

	if mainPostID == "" {
		return fbErr(500, "Facebook API error: failed to publish post")
	}
	allPostIDs := append([]string{mainPostID}, extraPostIDs...)
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("message", "Post published successfully")
	r.Set("data", map[string]any{
		"post_id": mainPostID, "extra_post_ids": extraPostIDs, "all_post_ids": allPostIDs,
		"pageId": pageID, "images_count": imagesPosted, "videos_count": videosPosted,
	})
	return r
}

func (h *SocialHandler) HandleFacebookMe(params map[string]any) *model.StandardResponse {
	token := paramStr(params, "accessToken")
	if token == "" {
		return fbErr(400, "Missing accessToken")
	}
	u := fmt.Sprintf("%s/me?access_token=%s", fbGraphBase, url.QueryEscape(token))
	body, err := h.facebookGet(u)
	if err != nil {
		return fbErr(500, "Error: "+err.Error())
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", body)
	r.Set("message", "Token valid")
	return r
}

func (h *SocialHandler) HandleFacebookExchangeToken(params map[string]any) *model.StandardResponse {
	token := paramStr(params, "accessToken")
	clientID := strings.TrimSpace(h.cfg.Facebook.AppID)
	appSecret := strings.TrimSpace(h.cfg.Facebook.AppSecret)
	if token == "" {
		return fbErr(400, "Missing accessToken")
	}
	if clientID == "" {
		return fbErr(503, "Facebook app ID is not configured on server")
	}
	if appSecret == "" {
		return fbErr(503, "Facebook app secret is not configured on server")
	}
	u := fmt.Sprintf("%s/oauth/access_token?grant_type=fb_exchange_token&client_id=%s&client_secret=%s&fb_exchange_token=%s",
		fbGraphBase, url.QueryEscape(clientID), url.QueryEscape(appSecret), url.QueryEscape(token))
	body, err := h.facebookGet(u)
	if err != nil {
		return fbErr(500, "Error: "+err.Error())
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", body)
	r.Set("message", "Token exchanged successfully")
	return r
}

func (h *SocialHandler) HandleFacebookPages(params map[string]any) *model.StandardResponse {
	token := paramStr(params, "accessToken")
	if token == "" {
		return fbErr(400, "Missing accessToken")
	}
	u := fmt.Sprintf("%s/me/accounts?fields=id,name,access_token,category,tasks&access_token=%s",
		fbGraphBase, url.QueryEscape(token))
	body, err := h.facebookGet(u)
	if err != nil {
		return fbErr(500, "Error: "+err.Error())
	}
	r := model.NewResponse()
	r.Set("code", 200)
	r.Set("success", true)
	r.Set("data", body)
	r.Set("message", "Pages retrieved successfully")
	return r
}

func (h *SocialHandler) HandleCreateAdCampaign(params map[string]any, platform string, authUser *security.AuthUser) *model.StandardResponse {
	if params["platform"] == nil {
		params["platform"] = platform
	}
	if params["adData"] == nil {
		params["adData"] = cloneParamsMap(params)
	}
	return h.crm.HandleCreateAd(params, authUser)
}

func fbErr(code int, message string) *model.StandardResponse {
	r := model.NewResponse()
	r.Set("code", code)
	r.Set("success", false)
	r.Set("message", message)
	return r
}

func (h *SocialHandler) facebookGet(rawURL string) (map[string]any, error) {
	resp, err := h.httpClient.Get(rawURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return parseFacebookResponse(resp)
}

func (h *SocialHandler) facebookPostJSON(rawURL string, payload map[string]any) (map[string]any, error) {
	data, _ := json.Marshal(payload)
	resp, err := h.httpClient.Post(rawURL, "application/json", bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return parseFacebookResponse(resp)
}

func (h *SocialHandler) facebookPostForm(rawURL string, fields map[string]string) (map[string]any, error) {
	form := url.Values{}
	for k, v := range fields {
		form.Set(k, v)
	}
	resp, err := h.httpClient.PostForm(rawURL, form)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return parseFacebookResponse(resp)
}

func (h *SocialHandler) facebookPostMultipart(rawURL string, fields map[string]string, fileField, fileName, mimeType string, fileData []byte) (map[string]any, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	part, err := w.CreateFormFile(fileField, fileName)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(fileData); err != nil {
		return nil, err
	}
	_ = w.Close()
	req, err := http.NewRequest(http.MethodPost, rawURL, &buf)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return parseFacebookResponse(resp)
}

func parseFacebookResponse(resp *http.Response) (map[string]any, error) {
	body, _ := io.ReadAll(resp.Body)
	var parsed map[string]any
	_ = json.Unmarshal(body, &parsed)
	if resp.StatusCode >= 200 && resp.StatusCode < 300 && parsed["error"] == nil {
		return parsed, nil
	}
	msg := fmt.Sprintf("Facebook API returned HTTP %d", resp.StatusCode)
	if errObj, ok := parsed["error"].(map[string]any); ok {
		if m, ok := errObj["message"].(string); ok {
			msg = m
		}
	}
	return nil, fmt.Errorf("%s", msg)
}

func (h *SocialHandler) loadBytesFromInput(input string) []byte {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil
	}
	if strings.HasPrefix(input, "data:image/") || strings.HasPrefix(input, "data:video/") {
		if idx := strings.Index(input, ","); idx >= 0 {
			if data, err := base64.StdEncoding.DecodeString(input[idx+1:]); err == nil && len(data) > 0 {
				return data
			}
		}
		return nil
	}
	if rel := relativePathFromInput(input); rel != "" {
		path := filepath.Join(h.cfg.DataDir, "public", rel)
		if data, err := os.ReadFile(path); err == nil && len(data) > 0 {
			return data
		}
	}
	if strings.HasPrefix(input, "http://") || strings.HasPrefix(input, "https://") {
		resp, err := h.httpClient.Get(input)
		if err != nil {
			return nil
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			data, _ := io.ReadAll(resp.Body)
			return data
		}
	}
	return nil
}

func relativePathFromInput(input string) string {
	if strings.HasPrefix(input, "/app_images/") || strings.HasPrefix(input, "app_images/") {
		return strings.TrimLeft(input, "/")
	}
	if strings.HasPrefix(input, "http://") || strings.HasPrefix(input, "https://") {
		if u, err := url.Parse(input); err == nil {
			if strings.HasPrefix(u.Path, "/app_images/") {
				return strings.TrimPrefix(u.Path, "/")
			}
		}
	}
	return ""
}

func sanitizeImages(raw []string) []string {
	out := []string{}
	for _, image := range raw {
		n := strings.TrimSpace(image)
		if n == "" {
			continue
		}
		ok := strings.HasPrefix(n, "http://") || strings.HasPrefix(n, "https://") || strings.HasPrefix(n, "data:image/")
		if ok && !containsStr(out, n) {
			out = append(out, n)
		}
	}
	return out
}

func sanitizeVideos(raw []string) []string {
	out := []string{}
	for _, video := range raw {
		n := strings.TrimSpace(video)
		if n == "" {
			continue
		}
		ok := strings.HasPrefix(n, "http://") || strings.HasPrefix(n, "https://") ||
			strings.HasPrefix(n, "data:video/") || strings.HasPrefix(n, "/app_images/") ||
			strings.HasPrefix(n, "app_images/")
		if ok && !containsStr(out, n) {
			out = append(out, n)
		}
	}
	return out
}

func containsStr(list []string, s string) bool {
	for _, item := range list {
		if item == s {
			return true
		}
	}
	return false
}

func cloneParamsMap(src map[string]any) map[string]any {
	out := make(map[string]any, len(src))
	for k, v := range src {
		out[k] = v
	}
	return out
}
