import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { policy_change } from "../controllers/policy.ts";

const router = new Router();

router
	.post("/policy_change", policy_change);

export default router;
