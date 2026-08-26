import { clsx, type ClassValue } from "clsx";
import { randomBytes } from "node:crypto";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string, opts?: Intl.DateTimeFormatOptions) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(
    "es-ES",
    opts ?? { day: "numeric", month: "long", year: "numeric" }
  ).format(d);
}

export function formatDateShort(date: Date | string) {
  return formatDate(date, { day: "numeric", month: "short" });
}

export function generateAccessToken(): string {
  return randomBytes(24).toString("hex");
}

export function generateBookingReference(): string {
  return "CDF-" + randomBytes(4).toString("hex").toUpperCase();
}

export function daysUntil(date: Date | string): number {
  const target = typeof date === "string" ? new Date(date) : date;
  const diffMs = target.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
