/**
 * Database seed — minimal. BOM data is seeded separately via seed-bom.ts
 */
export async function seedDatabase() {
  // BOM seed is run manually: npx tsx --env-file=.env server/seed-bom.ts
  // No automatic seeding needed at startup
}
