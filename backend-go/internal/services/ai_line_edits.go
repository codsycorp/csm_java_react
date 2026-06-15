package services

import (
	"strings"
)

// TextEdit is a line-based editor patch (1-based line numbers).
type TextEdit struct {
	StartLine   int    `json:"startLine"`
	EndLine     int    `json:"endLine"`
	Replacement string `json:"replacement"`
	Action      string `json:"action"`
}

// BuildLineTextEdits computes minimal line edits between two full-file texts.
func BuildLineTextEdits(beforeText, afterText string) []TextEdit {
	if afterText == beforeText {
		return nil
	}
	oldLines := strings.Split(beforeText, "\n")
	newLines := strings.Split(afterText, "\n")

	newLineIndex := map[string][]int{}
	for i, line := range newLines {
		newLineIndex[line] = append(newLineIndex[line], i)
	}

	var edits []TextEdit
	oldPos, newPos := 0, 0
	for oldPos < len(oldLines) || newPos < len(newLines) {
		if oldPos < len(oldLines) && newPos < len(newLines) && oldLines[oldPos] == newLines[newPos] {
			oldPos++
			newPos++
			continue
		}
		anchor := findNextLineAnchor(oldLines, newLines, newLineIndex, oldPos, newPos, 240, 360)
		if anchor == nil {
			appendLineEdit(&edits, oldLines, newLines, oldPos, len(oldLines), newPos, len(newLines))
			break
		}
		if anchor[0] > oldPos || anchor[1] > newPos {
			appendLineEdit(&edits, oldLines, newLines, oldPos, anchor[0], newPos, anchor[1])
		}
		oldPos = anchor[0]
		newPos = anchor[1]
	}
	return edits
}

func findNextLineAnchor(oldLines, newLines []string, newLineIndex map[string][]int, oldStart, newStart, maxOldScan, maxScore int) []int {
	bestOld, bestNew, bestScore := -1, -1, int(^uint(0)>>1)
	oldLimit := oldStart + maxOldScan
	if oldLimit > len(oldLines) {
		oldLimit = len(oldLines)
	}
	for oldPos := oldStart; oldPos < oldLimit; oldPos++ {
		candidates := newLineIndex[oldLines[oldPos]]
		if len(candidates) == 0 {
			continue
		}
		idx := lowerBound(candidates, newStart)
		if idx >= len(candidates) {
			continue
		}
		newPos := candidates[idx]
		score := (oldPos - oldStart) + (newPos - newStart)
		if score < bestScore {
			bestScore = score
			bestOld = oldPos
			bestNew = newPos
			if score == 0 {
				break
			}
		}
	}
	if bestOld < 0 || bestNew < 0 || bestScore > maxScore {
		return nil
	}
	return []int{bestOld, bestNew}
}

func lowerBound(nums []int, target int) int {
	lo, hi := 0, len(nums)
	for lo < hi {
		mid := (lo + hi) / 2
		if nums[mid] < target {
			lo = mid + 1
		} else {
			hi = mid
		}
	}
	return lo
}

func appendLineEdit(edits *[]TextEdit, oldLines, newLines []string, oldFrom, oldTo, newFrom, newTo int) {
	oldChanged := max(0, oldTo-oldFrom)
	newChanged := max(0, newTo-newFrom)
	if oldChanged == 0 && newChanged == 0 {
		return
	}
	startLine := oldFrom + 1
	endLine := startLine
	if oldChanged > 0 {
		endLine = oldTo
	}
	replacement := ""
	if newChanged > 0 {
		replacement = strings.Join(newLines[newFrom:newTo], "\n")
	}
	action := "edit"
	switch {
	case oldChanged == 0:
		action = "add"
	case newChanged == 0:
		action = "delete"
	}
	*edits = append(*edits, TextEdit{
		StartLine: startLine, EndLine: endLine,
		Replacement: replacement, Action: action,
	})
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func textEditsToMaps(edits []TextEdit) []map[string]any {
	out := make([]map[string]any, 0, len(edits))
	for _, e := range edits {
		out = append(out, map[string]any{
			"startLine": e.StartLine, "endLine": e.EndLine,
			"replacement": e.Replacement, "action": e.Action,
		})
	}
	return out
}
