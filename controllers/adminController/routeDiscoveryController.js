const discovery = require("../../services/routeDiscoveryService.js");

// ── Create Session ─────────────────────────────────────────────────────────────

const createSession = async (req, res) => {
    try {
        const session = await discovery.createDiscoverySession(req.body, req.adminInfo?.id);
        res.status(201).json({ success: true, message: "Discovery session created.", data: session });
    } catch (err) {
        const status = err.message.includes("not found") ? 404
            : err.message.includes("already exists") ? 409
            : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

// ── List Sessions ──────────────────────────────────────────────────────────────

const listSessions = async (req, res) => {
    try {
        const result = await discovery.listDiscoverySessions(req.query);
        res.status(200).json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── Get Single Session ─────────────────────────────────────────────────────────

const getSession = async (req, res) => {
    try {
        const session = await discovery.getDiscoverySession(req.params.id);
        res.status(200).json({ success: true, data: session });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 500).json({ success: false, message: err.message });
    }
};

// ── Select Route Option ────────────────────────────────────────────────────────

const selectRoute = async (req, res) => {
    try {
        const {
            routeOptionIndex,
            summary, distanceKm, durationMins, provider, encodedPolyline, stepPolylines,
        } = req.body;

        const idx = routeOptionIndex ?? 0;
        const routeMetadata = summary
            ? { summary, distanceKm, durationMins, provider, encodedPolyline, stepPolylines }
            : {};

        const session = await discovery.selectRouteOption(
            req.params.id,
            idx,
            req.adminInfo?.id,
            routeMetadata,
        );
        res.status(200).json({ success: true, message: "Route option selected.", data: session });
    } catch (err) {
        const status = err.message.includes("not found") ? 404
            : err.message.includes("Invalid") ? 400
            : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

// ── Patch a Discovered Stop ────────────────────────────────────────────────────

const patchStop = async (req, res) => {
    try {
        const session = await discovery.patchDiscoveredStop(
            req.params.id,
            req.params.stopId,
            req.body,
            req.adminInfo?.id
        );
        res.status(200).json({ success: true, message: "Discovered stop updated.", data: session });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

// ── Approve Session ────────────────────────────────────────────────────────────

const approveSession = async (req, res) => {
    try {
        const session = await discovery.approveSession(req.params.id, req.adminInfo?.id);
        res.status(200).json({ success: true, message: "Discovery session approved.", data: session });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

// ── Reject Session ─────────────────────────────────────────────────────────────

const rejectSession = async (req, res) => {
    try {
        const session = await discovery.rejectSession(req.params.id, req.adminInfo?.id);
        res.status(200).json({ success: true, message: "Discovery session rejected.", data: session });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

// ── Publish ────────────────────────────────────────────────────────────────────

const publishSession = async (req, res) => {
    try {
        const result = await discovery.publishSession(req.params.id, req.body, req.adminInfo?.id);
        res.status(200).json({
            success: true,
            message: `Discovery published. RouteVariant ${result.variant.code} created with ${result.stopsCreated} stops.`,
            data: {
                variantId: result.variant._id,
                variantCode: result.variant.code,
                corridorId: result.corridor._id,
                stopsCreated: result.stopsCreated,
                sessionId: result.session._id,
            },
        });
    } catch (err) {
        const status = err.message.includes("not found") ? 404
            : err.message.includes("transition") ? 409
            : 400;
        res.status(status).json({ success: false, message: err.message });
    }
};

// ── Provider Injection Hooks ───────────────────────────────────────────────────
// These endpoints are called by the Phase 2 (Mapbox) and Phase 3 (Google Places)
// clients. They are not directly invoked by the admin UI.

const setRouteOptions = async (req, res) => {
    try {
        const session = await discovery.setRouteOptions(req.params.id, req.body.routeOptions);
        res.status(200).json({ success: true, message: "Route options updated.", data: session });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

const setDiscoveredStops = async (req, res) => {
    try {
        const session = await discovery.setDiscoveredStops(req.params.id, req.body.discoveredStops);
        res.status(200).json({ success: true, message: "Discovered stops set.", data: session });
    } catch (err) {
        res.status(err.message.includes("not found") ? 404 : 400).json({ success: false, message: err.message });
    }
};

// ── Refine Stops with LLM  (background job + optional SSE stream) ─────────────
//
// Architecture:
//   1. Mark session as PROCESSING immediately and respond 202.
//   2. Start the LLM job inside setImmediate — it runs on the server regardless
//      of whether the browser tab stays open.
//   3. While the job runs, SSE chunks are forwarded to the browser in real time
//      (if the connection is still alive). If the client navigates away, writes
//      are silently dropped but the job continues.
//   4. On completion the DB is always updated (DONE / FAILED).
//   5. The frontend polls the session every 3 s while llmJobStatus === "PROCESSING".

const refineStopsWithLLM = async (req, res) => {
    // ── Validate the session exists and is in a refinable state ───────────────
    const RouteDiscovery = require("../../models/routeDiscoveryModel.js");
    const session = await RouteDiscovery.findById(req.params.id);

    if (!session) {
        return res.status(404).json({ success: false, message: "Discovery session not found." });
    }
    if (!["STOPS_DISCOVERED", "APPROVED"].includes(session.status)) {
        return res.status(400).json({ success: false, message: "Stops can only be refined when in STOPS_DISCOVERED or APPROVED status." });
    }
    if (session.discoveredStops.length === 0) {
        return res.status(400).json({ success: false, message: "No stops to refine." });
    }
    if (session.llmJobStatus === "PROCESSING") {
        return res.status(409).json({ success: false, message: "A refinement job is already running for this session." });
    }

    // ── Mark PROCESSING immediately so the frontend knows to poll ─────────────
    session.llmJobStatus = "PROCESSING";
    session.llmJobError  = null;
    await session.save();

    // ── Set up SSE so chunks stream to the browser while the tab is open ──────
    res.setHeader("Content-Type",      "text/event-stream");
    res.setHeader("Cache-Control",     "no-cache");
    res.setHeader("Connection",        "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const send = (data) => {
        if (!res.writableEnded) {
            try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch (_) {}
        }
    };

    // ── Fire the job in the background — decoupled from the HTTP connection ───
    setImmediate(async () => {
        try {
            // onChunk streams text chunks to the browser if still connected
            const onChunk = (text) => send({ text });

            await discovery.refineStopsWithLLM(req.params.id, req.adminInfo?.id, onChunk);

            // Job done — update status in DB
            await RouteDiscovery.findByIdAndUpdate(req.params.id, {
                llmJobStatus: "DONE",
                llmJobError:  null,
            });

            // Tell the browser it's complete (no-op if tab was closed)
            send({ complete: true });
            if (!res.writableEnded) res.end();
        } catch (err) {
            console.error("[RefineJob] Failed:", err.message);

            await RouteDiscovery.findByIdAndUpdate(req.params.id, {
                llmJobStatus: "FAILED",
                llmJobError:  err.message,
            });

            send({ error: true, message: err.message });
            if (!res.writableEnded) res.end();
        }
    });

    // ── Respond 202 immediately so the client knows the job started ───────────
    // Note: we already called res.flushHeaders() above for SSE, so we don't
    // send a second status code here. The SSE connection IS the 202 response.
};


module.exports = {
    createSession,
    listSessions,
    getSession,
    selectRoute,
    patchStop,
    approveSession,
    rejectSession,
    publishSession,
    setRouteOptions,
    setDiscoveredStops,
    refineStopsWithLLM,
};
