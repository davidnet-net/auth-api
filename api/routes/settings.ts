import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { saveprofile } from "../controllers/settings/profile.ts";
import { loadPreferences, savePreferences } from "../controllers/settings/preferences.ts";

const router = new Router();

router
    .post("/profile/save", saveprofile)
    .get("/preferences/load", loadPreferences)
    .post("/preferences/save", savePreferences)

export default router;
