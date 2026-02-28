import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** Check if Resend is configured and send recall reminder. Called from client with topic/interval info. */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const email = (session?.user as { email?: string })?.email;
    if (!email) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    const body = await req.json();
    const { topicTitle, intervalDay, topicId } = body as {
      topicTitle: string;
      intervalDay: number;
      topicId: string;
    };

    if (!topicTitle || !intervalDay) {
      return NextResponse.json({ error: "Missing topicTitle or intervalDay" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ sent: false, reason: "Email not configured" });
    }

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const from = process.env.RESEND_FROM ?? "Adaptive Learning <onboarding@resend.dev>";

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const label = `Day ${intervalDay} review`;
    const link = `${baseUrl}/dashboard/topic/${encodeURIComponent(topicId)}`;

    const { data, error } = await resend.emails.send({
      from,
      to: email,
      subject: `📚 ${label}: ${topicTitle}`,
      html: `
        <p>Hi!</p>
        <p>Your <strong>${label}</strong> for <strong>${topicTitle}</strong> is due today.</p>
        <p>Active recall helps you retain what you've learned. Take a few minutes to reinforce your memory!</p>
        <p><a href="${link}" style="display:inline-block;background:#5B7C99;color:white;padding:12px 24px;text-decoration:none;border-radius:8px;">Take your recall quiz</a></p>
        <p>Keep it up! 💪</p>
      `,
    });

    if (error) {
      console.error("Resend error:", error);
      return NextResponse.json({ sent: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sent: true, id: data?.id });
  } catch (e) {
    console.error("Recall notify error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
