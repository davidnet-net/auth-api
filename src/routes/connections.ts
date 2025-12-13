// routes/connections.ts
import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import {
	acceptConnectionRequest,
	cancelConnectionRequest,
	getConnections,
	getPendingConnections,
	removeConnection,
	sendConnectionRequest,
} from "../controllers/connections.ts";

const router = new Router();

// /connections/*
router
	// List accepted connections
	.get("/", getConnections)
	// List pending (both sent & received)
	.get("/pending", getPendingConnections)
	// Send a connection request  (body: { id: number })
	.post("/request", sendConnectionRequest)
	// Cancel an outgoing pending request  (body: { id: number })
	.post("/cancel", cancelConnectionRequest)
	// Accept an incoming pending request  (body: { id: number })
	.post("/accept", acceptConnectionRequest)
	// Remove an accepted connection  (body: { id: number })
	.post("/remove", removeConnection);

export default router;
