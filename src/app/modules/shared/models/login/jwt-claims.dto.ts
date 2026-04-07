export interface JwtClaims {
  exp?: number;
  oid?: string;
  nameid?: string;
  sub?: string;
  userId?: string;
  uid?: string;
  email?: string;
  unique_name?: string;
  [claim: string]: unknown;
}
