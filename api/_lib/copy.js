// WhatsApp class-group copy. Tries Claude when LLM_API_KEY is set; on any failure
// (no key, timeout, API error, refusal, empty reply) it falls back to hand-written templates.
import Anthropic from '@anthropic-ai/sdk';

const LANG_NAME = { en: 'English', ta: 'Tamil', te: 'Telugu' };
const DEFAULT_LINK = '[your referral link]';

const TEMPLATES = {
  en: {
    direct: ({ college, name, link }) =>
      `Hi ${college} 2027 batch 👋 ${name} here.\n\nFree 60-minute online workshop: "Build Your First AI Project in 60 Minutes". You build one live AI project you can actually explain in an interview — plus a GitHub link and a 30-second project story.\n\nOnly for final-year (2027) students. Registration takes 30 seconds: ${link}`,
    peer: ({ college, name, link }) =>
      `Hey ${college} folks, ${name} this side 🙂\n\nI've registered for a free 60-minute AI build session for 2027 batch students. No theory lecture — we each ship one small AI project we can show in placements.\n\nJoin me so we can build together: ${link}`,
    urgency: ({ college, name, link }) =>
      `⏳ ${college} 2027 batch — seats for the free "Build Your First AI Project in 60 Minutes" workshop close in 24 hours.\n\n60 minutes, one working AI project, one interview-ready story. Bring a friend.\n\nRegister in 30 sec: ${link}\n— ${name}`,
  },
  ta: {
    direct: ({ college, name, link }) =>
      `${college} 2027 batch நண்பர்களே 👋 நான் ${name}.\n\n"Build Your First AI Project in 60 Minutes" — final-year மாணவர்களுக்கு ஒரு free online workshop. Interview-ல் confident-ஆ explain செய்யக்கூடிய ஒரு live AI project build பண்ணலாம், கூடவே GitHub link-உம் கிடைக்கும்.\n\n30 seconds-ல register பண்ணுங்க: ${link}`,
    peer: ({ college, name, link }) =>
      `Hi ${college} friends, ${name} இங்கே 🙂\n\nநான் ஒரு free 60-minute AI build workshop-க்கு register பண்ணிட்டேன். Lecture இல்ல — நாம ஒவ்வொருவரும் placements-க்கு காட்டக்கூடிய ஒரு சின்ன AI project ship பண்ணலாம்.\n\nநாம சேர்ந்து build பண்ணலாமா? ${link}`,
    urgency: ({ college, name, link }) =>
      `⏳ ${college} 2027 batch — free "Build Your First AI Project in 60 Minutes" workshop-க்கு 24 hours தான் இருக்கு!\n\n60 நிமிடம், ஒரு working AI project, ஒரு interview-ready story. ஒரு friend-ஐயும் கூட்டிட்டு வாங்க.\n\nRegister: ${link}\n— ${name}`,
  },
  te: {
    direct: ({ college, name, link }) =>
      `${college} 2027 batch friends కి 👋 నేను ${name}.\n\n"Build Your First AI Project in 60 Minutes" — final-year students కోసం free online workshop. Interviewలో confidentగా explain చేయగల ఒక live AI project build చేద్దాం, GitHub link కూడా వస్తుంది.\n\n30 secondsలో register అవ్వండి: ${link}`,
    peer: ({ college, name, link }) =>
      `Hi ${college} friends, ${name} ఇక్కడ 🙂\n\nనేను free 60-minute AI build workshopకి register అయ్యాను. Lecture కాదు — placementsలో చూపించగల ఒక చిన్న AI project మనమే ship చేస్తాం.\n\nకలిసి build చేద్దామా? ${link}`,
    urgency: ({ college, name, link }) =>
      `⏳ ${college} 2027 batch — free "Build Your First AI Project in 60 Minutes" workshopకి ఇంకా 24 hours మాత్రమే!\n\n60 నిమిషాలు, ఒక working AI project, ఒక interview-ready story. ఒక friendని కూడా తీసుకురండి.\n\nRegister: ${link}\n— ${name}`,
  },
};

export function templateMessage({ language, tone, college, ambassador_name, link }) {
  return TEMPLATES[language][tone]({ college, name: ambassador_name, link: link || DEFAULT_LINK });
}

const SYSTEM = `You write short WhatsApp posts that a campus ambassador shares in their college class group.
The event: "Build Your First AI Project in 60 Minutes" — a free, online, 60-minute hands-on workshop for final-year (2027 batch) engineering students. Each student builds one small working AI project, leaves with a GitHub link and a 30-second way to explain it in placement interviews.
Rules:
- Write like a classmate, not an ad. 50–90 words. At most two emojis. Short paragraphs.
- Never invent facts: no seat counts, prices, prizes, certificates, company names, dates, or "X students already joined".
- Include the registration link exactly as given, once.
- For Tamil or Telugu, write in that script and keep common tech words (AI, project, GitHub, workshop, register, placements) in English, the way students actually text.
- Output only the message text. No title, no quotes, no explanation.`;

const TONE_HINT = {
  direct: 'Clear and direct: what it is, who it is for, what you leave with.',
  peer: 'Warm, peer-to-peer: "I registered, come build with me".',
  urgency: 'Gentle 24-hour urgency without exaggeration.',
};

export async function generateMessage(input) {
  const fallback = (reason) => ({ message: templateMessage(input), source: 'template', fallback_reason: reason });
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return fallback('LLM_API_KEY is not set');

  const model = process.env.LLM_MODEL || 'claude-opus-5-5';
  const link = input.link || DEFAULT_LINK;
  try {
    const client = new Anthropic({
      apiKey,
      ...(process.env.LLM_BASE_URL ? { baseURL: process.env.LLM_BASE_URL } : {}),
      timeout: 20000,
      maxRetries: 1,
    });
    const response = await client.messages.create({
      model,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Language: ${LANG_NAME[input.language]}\nTone: ${TONE_HINT[input.tone]}\nCollege: ${input.college}\nAmbassador name (sign-off): ${input.ambassador_name}\nChannel context: ${input.channel}\nRegistration link: ${link}`,
      }],
    });
    if (response.stop_reason === 'refusal') return fallback('model declined the request');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!text) return fallback('model returned an empty message');
    return { message: text, source: 'llm', model: response.model };
  } catch (err) {
    console.error('[copy-generate] LLM call failed, using template:', err?.status || '', err?.message);
    return fallback(err?.status ? `LLM API error ${err.status}` : 'LLM request failed or timed out');
  }
}
