// List csm_accounts from Pebble (read-only) and test Find when server is up.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/cockroachdb/pebble"
)

func main() {
	dataDir := envOr("APP_DATA_DIR", "/Volumes/Datas/CSM/JavaProjects/csm_server/backend/csm_datas")
	pebbleRoot := filepath.Join(dataDir, "native", "pebble")
	tablePath := filepath.Join(pebbleRoot, "csm", "csm_accounts")

	db, err := pebble.Open(tablePath, &pebble.Options{ReadOnly: true})
	if err != nil {
		fmt.Fprintf(os.Stderr, "open readonly %s: %v\n", tablePath, err)
		os.Exit(1)
	}
	defer db.Close()

	type acct struct {
		key                        string
		id, username, email, pass string
		actived                    any
	}
	var accounts []acct
	iter, _ := db.NewIter(&pebble.IterOptions{})
	defer iter.Close()
	for iter.First(); iter.Valid(); iter.Next() {
		key := string(iter.Key())
		if strings.HasPrefix(key, "__") {
			continue
		}
		var rec map[string]any
		if json.Unmarshal(iter.Value(), &rec) != nil {
			continue
		}
		accounts = append(accounts, acct{
			key:      key,
			id:       fmt.Sprint(rec["id"]),
			username: fmt.Sprint(rec["username"]),
			email:    fmt.Sprint(rec["email"]),
			pass:     fmt.Sprint(rec["pass"]),
			actived:  rec["actived"],
		})
	}

	fmt.Printf("csm_accounts readonly count: %d\n", len(accounts))
	for i, a := range accounts {
		if i >= 40 {
			fmt.Printf("... and %d more\n", len(accounts)-40)
			break
		}
		fmt.Printf("  key=%s id=%s user=%s email=%s actived=%v pass_len=%d\n",
			a.key, a.id, a.username, a.email, a.actived, len(a.pass))
	}

	logins := []string{"quantriweb", "wuweb", "admin"}
	for _, login := range logins {
		fmt.Printf("\nmatch loginID=%q:\n", login)
		hits := 0
		for _, a := range accounts {
			if strings.EqualFold(a.username, login) || strings.EqualFold(a.email, login) || a.username == login || a.email == login {
				hits++
				fmt.Printf("  HIT key=%s user=%s email=%s actived=%v pass_empty=%v\n",
					a.key, a.username, a.email, a.actived, a.pass == "" || a.pass == "<nil>")
			}
		}
		if hits == 0 {
			fmt.Println("  (no match)")
		}
	}

	gmPath := filepath.Join(pebbleRoot, "csm", "csm_group_members")
	if gdb, err := pebble.Open(gmPath, &pebble.Options{ReadOnly: true}); err == nil {
		defer gdb.Close()
		giter, _ := gdb.NewIter(&pebble.IterOptions{})
		defer giter.Close()
		subCount := 0
		fmt.Println("\ncsm_group_members:")
		for giter.First(); giter.Valid(); giter.Next() {
			key := string(giter.Key())
			if strings.HasPrefix(key, "__") {
				continue
			}
			var rec map[string]any
			if json.Unmarshal(giter.Value(), &rec) != nil {
				continue
			}
			subCount++
			li := fmt.Sprint(rec["login_identifier"])
			if subCount <= 15 || strings.Contains(strings.ToLower(li), "wuweb") || strings.Contains(strings.ToLower(li), "quantri") {
				fmt.Printf("  sub key=%s login_identifier=%s actived=%v pass_len=%d\n",
					key, li, rec["actived"], len(fmt.Sprint(rec["pass"])))
			}
		}
		fmt.Printf("csm_group_members readonly count: %d\n", subCount)
	}
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
