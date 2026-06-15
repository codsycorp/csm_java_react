package data

import (
	"crypto/sha256"
	"fmt"
	"math"
	"strings"
)

const defaultEmbedDim = 384

// HashEmbedJSON returns normalized hash embedding JSON for sqlite-vec (migrate parity).
func HashEmbedJSON(text string, dim int) string {
	if dim <= 0 {
		dim = defaultEmbedDim
	}
	vec := hashEmbed(text, dim)
	vals := make([]string, dim)
	for i, v := range vec {
		vals[i] = fmt.Sprintf("%g", v)
	}
	return "[" + strings.Join(vals, ",") + "]"
}

// HashEmbed returns normalized hash embedding vector (migrate parity).
func HashEmbed(text string, dim int) []float32 {
	return hashEmbed(text, dim)
}

func hashEmbed(text string, dim int) []float32 {
	out := make([]float32, dim)
	for i := 0; i < dim; i++ {
		h := sha256.Sum256([]byte(fmt.Sprintf("%s:%d", text, i)))
		out[i] = (float32(int(h[0])<<8|int(h[1]))/65535)*2 - 1
	}
	var norm float64
	for _, v := range out {
		norm += float64(v) * float64(v)
	}
	norm = math.Sqrt(norm)
	if norm > 0 {
		for i := range out {
			out[i] = float32(float64(out[i]) / norm)
		}
	}
	return out
}

// CosineSimilarity between two equal-length vectors.
func CosineSimilarity(a, b []float32) float64 {
	if len(a) == 0 || len(a) != len(b) {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
