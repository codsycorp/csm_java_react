package dataplatform

import (
	"context"
	"log"

	"csm_server/backend-go/internal/config"
	"csm_server/backend-go/internal/platform/catalog"
	"csm_server/backend-go/internal/platform/events"
	"csm_server/backend-go/internal/platform/lake"
	"csm_server/backend-go/internal/platform/lineage"
	"csm_server/backend-go/internal/platform/outbox"
)

// Runtime wires transactional outbox, lake export, lineage, and catalog.
type Runtime struct {
	Outbox  *outbox.Store
	Worker  *outbox.Worker
	Lineage *lineage.Store
	Catalog *catalog.Registry
	Lake    *lake.Exporter
}

func Bootstrap(cfg config.AppConfig, bus events.Bus) (*Runtime, error) {
	lin, err := lineage.OpenStore(cfg)
	if err != nil {
		return nil, err
	}
	cat, err := catalog.OpenRegistry(cfg)
	if err != nil {
		lin.Close()
		return nil, err
	}
	ob, err := outbox.OpenStore(cfg)
	if err != nil {
		lin.Close()
		return nil, err
	}
	lk, err := lake.NewExporter(cfg, lin)
	if err != nil {
		ob.Close()
		lin.Close()
		return nil, err
	}
	var handlers []outbox.Handler
	if lk.Enabled() {
		handlers = append(handlers, lk.OutboxHandler())
	}
	if lin.Enabled() {
		handlers = append(handlers, lineageHandler(lin))
	}
	worker := outbox.NewWorker(cfg, ob, bus, handlers...)
	worker.Start()
	log.Printf("DataPlatform: outbox=%v lake=%v lineage=%v catalog=%v",
		ob.Enabled(), lk.Enabled(), lin.Enabled(), cat.Enabled())
	return &Runtime{
		Outbox:  ob,
		Worker:  worker,
		Lineage: lin,
		Catalog: cat,
		Lake:    lk,
	}, nil
}

func lineageHandler(lin *lineage.Store) outbox.Handler {
	return func(ctx context.Context, msg outbox.Message) error {
		return lin.Record(lineage.Edge{
			SourceID:   msg.ID,
			SourceType: "outbox",
			Target:     msg.Topic,
			TargetType: "event_bus",
		})
	}
}

func (r *Runtime) Shutdown() {
	if r == nil {
		return
	}
	if r.Worker != nil {
		r.Worker.Stop()
	}
	if r.Outbox != nil {
		r.Outbox.Close()
	}
	if r.Lineage != nil {
		r.Lineage.Close()
	}
}
