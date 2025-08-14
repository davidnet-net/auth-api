import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { saveprofile } from "../controllers/settings/profile.ts";

const router = new Router();

router
    .post("/profile/save", saveprofile)

export default router;
