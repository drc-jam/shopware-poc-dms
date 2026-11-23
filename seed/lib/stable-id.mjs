// Deterministic Shopware IDs (DEV_GUIDE §8): lowercase hex MD5 of "<entity>:<businessKey>".
import { createHash } from "node:crypto";

export const stableId = (entity, businessKey) => createHash("md5").update(`${entity}:${businessKey}`).digest("hex");
