import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { moderate_DELETE_account } from "../controllers/moderation.ts";

const router = new Router();

router
    .post("/delete_account", moderate_DELETE_account)

export default router;
