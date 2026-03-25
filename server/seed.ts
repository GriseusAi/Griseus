/**
 * Database seed — ensures ELT.7-11 product exists.
 * BOM data is seeded separately via seed-bom.ts
 */
import { db } from "./db";
import { products } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function seedDatabase() {
  // Ensure ELT.7-11 product exists
  const [existing] = await db.select().from(products).where(eq(products.sku, "ELT.7-11"));
  if (!existing) {
    await db.insert(products).values({
      tenantId: "cukurova",
      sku: "ELT.7-11",
      name: "Goldsun Elite - Seramik Plakalı Camlı Radyant Isıtıcı - 7/9/11 KW Üç kademeli",
      category: "Radyant Isıtıcı",
    });
    console.log("  ✓ ELT.7-11 product seeded");
  }
}
