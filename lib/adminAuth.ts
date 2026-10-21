import { timingSafeEqual } from "node:crypto";

export function hasAdminAccess(authorization: string | null): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const expected = process.env.ADMIN_KEY;
  const supplied = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!expected || !supplied) return false;

  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
