import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import health from "./health.ts";
import settings from "./settings.ts"
import verify from "./verify.ts";
import connections from "./connections.ts"

// Single Routes
import signup from "../controllers/signup.ts";
import refresh from "../controllers/refresh.ts"
import login from "../controllers/login.ts"
import profile from "../controllers/profile.ts"
import logout from "../controllers/logout.ts";

// Router
const router = new Router();

//? Sub Routes
router.use("/health", health.routes(), health.allowedMethods());
router.use("/settings", settings.routes(), settings.allowedMethods());
router.use("/verify", verify.routes(), verify.allowedMethods());
router.use("/connections", connections.routes(), connections.allowedMethods());

//? Single Routes
router.post("/signup", signup);
router.post("/logout", logout);
router.post("/login", login);
router.post("/refresh", refresh);
router.get("/profile/:id", profile)

export default router;
