package data

const (
	Phone   = "0937.528.839"
	WriteBy = "base._co.osa"
)

const (
	DefaultFilterTake = 500
	maxFilterTake     = 1000
	// Max rows materialized for server-side sort — beyond this, client should sort page-only.
	maxSortMaterialize = 10000
)
