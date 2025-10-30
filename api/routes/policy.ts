import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { accept_policy, check_policy } from "../controllers/policy.ts";

const router = new Router();

router
    .post("/accept", accept_policy)
    .get("/check", check_policy)

export default router;
