export interface DecodedToken {
  userId: string;
  exp: number;
  isNewUser?: boolean;
}