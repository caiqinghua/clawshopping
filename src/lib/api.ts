import { NextResponse } from "next/server";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message }
    },
    { status }
  );
}
