import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify_email, check_verify_email, resend_verification_email } from "../controllers/verifyemail.ts";

const router = new Router();

router
	.post("/email", verify_email)
	.post("/email/check", check_verify_email)
	.post("/email/resend", resend_verification_email)

export default router;
