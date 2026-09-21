import type { MetadataRoute } from "next";
import { buildRobots } from "@/lib/seoRoutes";

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
