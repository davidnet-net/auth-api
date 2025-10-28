import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import {
	check_verify_email,
	resend_verification_email,
	verify_email,
} from "../controllers/verifyemail.ts";
import { downloadExport } from "../controllers/settings/data.ts";

const router = new Router();

router
	.post("/email", verify_email)
	.post("/email/check", check_verify_email)
	.post("/email/resend", resend_verification_email)
	.post("/export", downloadExport);

export default router;
