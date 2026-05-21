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
        subject: 'After Sec 2 camp — three moments',
        body:    'The bus has dropped you home by now, the laundry pile is sitting somewhere your mother can see it, and the camp probably feels both very loud and very far away.\n\nBefore the noise of school comes back, I want to ask you something that won\'t get marked. What were three moments from camp that have stayed with you? Small, specific, weird if they want to be. Not the ones that look good in a group photo — the ones that show up when nobody\'s asking.\n\nTap Capture below when you have one. It opens the same place you usually talk to Kira, so you can type, voice, or just sit with it. One moment at a time is plenty. They will keep, and we can talk about them after.\n\n— Ms. Tan',
        sentAt:  isoDaysAgo(0),
        read:    false,
        prompt:  'What are three moments from Sec 2 camp that have stayed with you?',
    },
    {
        id:      'lt_01',
        from:    'Ms. Tan',
        subject: 'A small noticing during recess',
        body:    'I saw you sit with Shafiqah at the corner bench on Tuesday — the one with the broken slat. You didn\'t do anything dramatic. You just stayed. I don\'t think she would have said it out loud, but it landed.\n\nThe thing I want you to know is that quiet company is also work. It costs you something to sit there. I see you doing it more than once a week now, and I want to ask you a question I usually keep for older students: how do you know when to leave? Not when to step away from her — when to step away from the role. We can talk about it whenever you want. No need to bring it up if it\'s not on your mind.\n\nTake care of your sleep. The maths waits.\n\n— Ms. Tan',
        sentAt:  isoDaysAgo(2),
        read:    false,
    },
    {
        id:      'lt_02',
        from:    'Ms. Tan',
        subject: 'About your VIA reflection — the elder-befriending one',
        body:    'I read what you wrote about going home feeling "full, not tired." I have been doing this job long enough to take that line seriously. Most students come back from VIA with a checklist energy. You came back with a different one.\n\nI am not going to tell you what it means. That\'s for you to keep watching. But I would gently ask: what would it look like if the next CCA-style choice you made was tested against that same word — full, not tired? You don\'t have to answer me. Write it in your own book somewhere where you\'ll see it again in two months.\n\n— Ms. Tan',
        sentAt:  isoDaysAgo(9),
        read:    true,
    },
    {
        id:      'lt_03',
        from:    'Ms. Tan',
        subject: 'Re: the Tuesday assignment',
        body:    'Thank you for asking for an extension instead of pretending. You handled it well. Three things, and then I will let you go:\n\n1. The extension is fine. New due date is Monday morning before form time.\n2. Your maths is improving. I can see it in your working, not just your final answers.\n3. The thing you said about your grandma — I will not bring it up if you don\'t. But I noted it.\n\n— Ms. Tan',
        sentAt:  isoDaysAgo(16),
        read:    true,
    },
]
