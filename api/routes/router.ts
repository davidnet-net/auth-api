import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import health from "./health.ts";
import verify from "./verify.ts";

//import auth from "../middlewares/auth.ts";

// Single Routes
import signup from "../controllers/signup.ts";
import refresh from "../controllers/refresh.ts"

// Router
const router = new Router();

//? Sub Routes
router.use("/health", health.routes(), health.allowedMethods());
router.use("/verify", verify.routes(), verify.allowedMethods());

// If AUTH is needed add [auth] like below
//router.use("/health", auth, health.routes(), health.allowedMethods());

//? Single Routes
router.post("/signup", signup);
router.post("/refresh", refresh);

export default router;
