import { request } from "#src/utils";

export interface RegisterPayload {
  username?: string;
  password: string;
  email?: string;
  phoneNumber?: string;
  full_name?: string;
  user_address?: string;
  app_token?: string;
}

export interface RegisterResponse {
  success?: boolean;
  message?: string;
  [key: string]: any;
}

export function fetchRegister(data: RegisterPayload) {
  return request.post("register", { json: data }).json<RegisterResponse>();
}
