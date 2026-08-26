export type OutgoingEmail = {
  to: string;
  subject: string;
  body: string;
};

export type SendResult = {
  delivered: boolean; // true only for a real send
  mode: "demo" | "real";
};

export interface EmailProvider {
  send(email: OutgoingEmail): Promise<SendResult>;
}
