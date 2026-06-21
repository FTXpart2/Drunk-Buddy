// Serves a contact card so "Add Drunk Buddy" saves the chat under the name
// "Drunk Buddy", wired to the buddy's Apple ID email so iMessage routes to it.
export function GET() {
  const handle = process.env.NEXT_PUBLIC_BUDDY_HANDLE || "katikati806@gmail.com";
  const contactLine = handle.includes("@")
    ? `EMAIL;type=INTERNET;type=pref:${handle}`
    : `TEL;type=CELL:${handle}`;

  const vcf = ["BEGIN:VCARD", "VERSION:3.0", "N:Buddy;Drunk;;;", "FN:Drunk Buddy", contactLine, "END:VCARD"].join(
    "\r\n",
  );

  return new Response(vcf, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Drunk Buddy.vcf"',
    },
  });
}
