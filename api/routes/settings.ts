import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { saveprofile } from "../controllers/settings/profile.ts";
import { loadPreferences, savePreferences } from "../controllers/settings/preferences.ts";
import { change_password, loadSecurity, set_twofa_email_enabled, set_twofa_totp_enabled } from "../controllers/settings/security.ts";

const router = new Router();

router
    .post("/profile/save", saveprofile)
    .get("/preferences/load", loadPreferences)
    .post("/preferences/save", savePreferences)
    .post("/security/change_password", change_password)
    .post("/security/twofa/email", set_twofa_email_enabled)
    .post("/security/twofa/totp", set_twofa_totp_enabled)
    .get("/security/load", loadSecurity)

export default router;
