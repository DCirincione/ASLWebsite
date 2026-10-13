import { NextResponse } from "next/server";

// All new bookings must pass through paid checkout and its verified confirmation.
export async function POST() {
  return NextResponse.json({ error: "Please book through the Trainers page to complete secure checkout." }, { status: 410 });
}
