import { db } from "../db";
import { objectTypes, objects, linkTypes, links, actionsLog } from "@shared/schema";
import { eq, and, sql, ilike, or } from "drizzle-orm";
import type { GEObject, ObjectType, LinkType, Link } from "@shared/schema";

export class OntologyService {
  // ── Object Types ──────────────────────────────────────────────────

  async createObjectType(apiName: string, displayName: string, propertySchema: Record<string, any> = {}, description?: string): Promise<ObjectType> {
    const [result] = await db.insert(objectTypes).values({
      apiName,
      displayName,
      description,
      propertySchema,
    }).onConflictDoUpdate({
      target: objectTypes.apiName,
      set: { displayName, description, propertySchema, updatedAt: new Date() },
    }).returning();
    return result;
  }

  async getObjectTypes(): Promise<ObjectType[]> {
    return db.select().from(objectTypes);
  }

  async getObjectTypeByApiName(apiName: string): Promise<ObjectType | undefined> {
    const [result] = await db.select().from(objectTypes).where(eq(objectTypes.apiName, apiName));
    return result;
  }

  // ── Objects ───────────────────────────────────────────────────────

  async createObject(objectTypeApiName: string, externalId: string, title: string, properties: Record<string, any> = {}): Promise<GEObject> {
    const objType = await this.getObjectTypeByApiName(objectTypeApiName);
    if (!objType) throw new Error(`Object type '${objectTypeApiName}' not found`);

    const [result] = await db.insert(objects).values({
      objectTypeId: objType.id,
      externalId,
      title,
      properties,
    }).onConflictDoUpdate({
      target: [objects.objectTypeId, objects.externalId],
      set: { title, properties, updatedAt: new Date() },
    }).returning();
    return result;
  }

  async getObject(id: string): Promise<GEObject | undefined> {
    const [result] = await db.select().from(objects).where(eq(objects.id, id));
    return result;
  }

  async getObjectsByType(typeApiName: string, filters?: Record<string, any>): Promise<GEObject[]> {
    const objType = await this.getObjectTypeByApiName(typeApiName);
    if (!objType) return [];

    const conditions = [eq(objects.objectTypeId, objType.id)];

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        conditions.push(sql`${objects.properties}->>\'${sql.raw(key)}\' = ${String(value)}`);
      }
    }

    return db.select().from(objects).where(and(...conditions));
  }

  async updateObject(id: string, updates: { title?: string; properties?: Record<string, any>; computedProperties?: Record<string, any> }): Promise<GEObject | undefined> {
    const setValues: any = { updatedAt: new Date() };
    if (updates.title) setValues.title = updates.title;
    if (updates.properties) setValues.properties = updates.properties;
    if (updates.computedProperties) setValues.computedProperties = updates.computedProperties;

    const [result] = await db.update(objects).set(setValues).where(eq(objects.id, id)).returning();
    return result;
  }

  async deleteObject(id: string): Promise<boolean> {
    const result = await db.delete(objects).where(eq(objects.id, id)).returning();
    return result.length > 0;
  }

  // ── Link Types ────────────────────────────────────────────────────

  async createLinkType(apiName: string, displayName: string, sourceTypeApiName: string, targetTypeApiName: string, cardinality: string = "one_to_many", propertiesSchema: Record<string, any> = {}): Promise<LinkType> {
    const sourceType = await this.getObjectTypeByApiName(sourceTypeApiName);
    const targetType = await this.getObjectTypeByApiName(targetTypeApiName);
    if (!sourceType) throw new Error(`Source type '${sourceTypeApiName}' not found`);
    if (!targetType) throw new Error(`Target type '${targetTypeApiName}' not found`);

    const [result] = await db.insert(linkTypes).values({
      apiName,
      displayName,
      sourceTypeId: sourceType.id,
      targetTypeId: targetType.id,
      cardinality,
      propertiesSchema,
    }).onConflictDoUpdate({
      target: linkTypes.apiName,
      set: { displayName, sourceTypeId: sourceType.id, targetTypeId: targetType.id, cardinality, propertiesSchema },
    }).returning();
    return result;
  }

  async getLinkTypes(): Promise<LinkType[]> {
    return db.select().from(linkTypes);
  }

  // ── Links ─────────────────────────────────────────────────────────

  async createLink(linkTypeApiName: string, sourceObjectId: string, targetObjectId: string, properties: Record<string, any> = {}): Promise<Link> {
    const [lt] = await db.select().from(linkTypes).where(eq(linkTypes.apiName, linkTypeApiName));
    if (!lt) throw new Error(`Link type '${linkTypeApiName}' not found`);

    const [result] = await db.insert(links).values({
      linkTypeId: lt.id,
      sourceObjectId,
      targetObjectId,
      properties,
    }).onConflictDoUpdate({
      target: [links.linkTypeId, links.sourceObjectId, links.targetObjectId],
      set: { properties },
    }).returning();
    return result;
  }

  async deleteLink(id: string): Promise<boolean> {
    const result = await db.delete(links).where(eq(links.id, id)).returning();
    return result.length > 0;
  }

  async getLinkedObjects(objectId: string, linkTypeApiName?: string, direction: "outgoing" | "incoming" | "both" = "both"): Promise<{ link: Link; object: GEObject; direction: string }[]> {
    const results: { link: Link; object: GEObject; direction: string }[] = [];

    let linkTypeCondition: any = undefined;
    if (linkTypeApiName) {
      const [lt] = await db.select().from(linkTypes).where(eq(linkTypes.apiName, linkTypeApiName));
      if (lt) linkTypeCondition = eq(links.linkTypeId, lt.id);
    }

    if (direction === "outgoing" || direction === "both") {
      const conditions = [eq(links.sourceObjectId, objectId)];
      if (linkTypeCondition) conditions.push(linkTypeCondition);
      const outgoing = await db.select().from(links).where(and(...conditions));
      for (const link of outgoing) {
        const obj = await this.getObject(link.targetObjectId);
        if (obj) results.push({ link, object: obj, direction: "outgoing" });
      }
    }

    if (direction === "incoming" || direction === "both") {
      const conditions = [eq(links.targetObjectId, objectId)];
      if (linkTypeCondition) conditions.push(linkTypeCondition);
      const incoming = await db.select().from(links).where(and(...conditions));
      for (const link of incoming) {
        const obj = await this.getObject(link.sourceObjectId);
        if (obj) results.push({ link, object: obj, direction: "incoming" });
      }
    }

    return results;
  }

  // ── Search ────────────────────────────────────────────────────────

  async searchObjects(query: string): Promise<GEObject[]> {
    const pattern = `%${query}%`;
    return db.select().from(objects).where(
      or(
        ilike(objects.title, pattern),
        sql`${objects.properties}::text ILIKE ${pattern}`,
        ilike(objects.externalId, pattern),
      )
    );
  }

  // ── Actions Log ───────────────────────────────────────────────────

  async logAction(actionType: string, actor: string, targetObjectId: string | null, payload: Record<string, any>, result: Record<string, any> = {}) {
    await db.insert(actionsLog).values({
      actionType,
      actor,
      targetObjectId,
      payload,
      result,
    });
  }
}

export const ontologyService = new OntologyService();
