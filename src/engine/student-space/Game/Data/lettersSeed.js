/**
 * Seed letters from a form teacher. Read-only inbox in v1.1.
 *
 * Voice: a real Singaporean secondary-school form teacher writing to one
 * student, intimate but not familiar. Not a notification. Not a graded
 * comment. The letter is the only opening on the surface where an adult
 * gets to say "I noticed you", which is rarer in MOE secondary life than
 * the curriculum tends to admit. Keep them short.
 */

const isoDaysAgo = (n) =>
{
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString()
}

export const LETTERS_SEED = [
    {
        id:      'lt_camp_reflect',
        from:    'Ms. Tan',
        subject: 'After Sec 2 camp — what stuck',
        body:    'The bus has dropped you home by now, the laundry pile is sitting somewhere your mother can see it, and the camp probably feels both very loud and very far away.\n\nBefore the noise of school comes back, I want to ask you something that won\'t get marked. What are some things from camp that have stuck with you since? Small, specific, weird if they want to be. Not the ones that look good in a group photo — the ones that show up when nobody\'s asking.\n\nTap Capture below when you have one. It opens the same place you usually talk to your bird, so you can type, voice, or just sit with it. One moment at a time is plenty. They will keep, and we can talk about them after.\n\n— Ms. Tan',
        sentAt:  isoDaysAgo(0),
        read:    false,
        prompt:  'Thinking back to Sec 2 camp, what are some things that have stuck with you since?',
    },
    {
        id:      'lt_careerfair_reflect',
        from:    'Ms. Tan',
        subject: 'After the career fair — what stood out',
        body:    'The career fair booths are packed away by now, and the hall probably feels strange and quiet without all that noise.\n\nI\'m not asking which booth you liked most, or what you want to be. I\'m asking something smaller. What were three things that stood out to you, and why? A conversation, a display, a question someone asked you — anything that caught and held for a moment.\n\nTap Capture below when you have one. It opens the same place you usually talk to your bird.\n\n— Ms. Tan',
        sentAt:  isoDaysAgo(1),
        read:    false,
        prompt:  'At the career fair, what were three things that stood out to you, and why?',
    },
]
