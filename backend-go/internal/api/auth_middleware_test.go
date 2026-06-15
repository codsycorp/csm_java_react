package api

import "testing"

func TestIsDispatchAPIRequestBarePathOnLocalhost(t *testing.T) {
	if !isDispatchAPIRequest("/get-async-routes", "localhost:9999") {
		t.Fatal("bare get-async-routes on localhost must require auth middleware")
	}
	if !isDispatchAPIRequest("/user-info", "localhost:9999") {
		t.Fatal("bare user-info on localhost must require auth middleware")
	}
}

func TestIsDispatchAPIRequestAdminHostSkipsBarePaths(t *testing.T) {
	if isDispatchAPIRequest("/get-async-routes", "admin.csmbridge.net") {
		t.Fatal("bare paths on admin host are SPA routes, not API dispatch")
	}
}

func TestIsDispatchAPIRequestApiHost(t *testing.T) {
	if !isDispatchAPIRequest("/get-async-routes", "api.csmbridge.net") {
		t.Fatal("api host must always dispatch API paths")
	}
}
