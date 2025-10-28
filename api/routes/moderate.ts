import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { moderate_DELETE_account, moderate_PROFILE_PICTURE_RESET } from "../controllers/moderation.ts";

const router = new Router();

router
    .post("/delete_account", moderate_DELETE_account)
    .post("/reset_profile_picture", moderate_PROFILE_PICTURE_RESET)

export default router;
