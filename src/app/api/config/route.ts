import { NextResponse } from 'next/server';

export async function GET() {
  const mock = !process.env.GLOO_API_KEY || !process.env.OPENAI_API_KEY;
  return NextResponse.json({ mock });
}
