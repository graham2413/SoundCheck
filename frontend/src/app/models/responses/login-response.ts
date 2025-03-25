import { User } from "./user.response";

export interface LoginResponse {
    token: string;
    user: User;
}