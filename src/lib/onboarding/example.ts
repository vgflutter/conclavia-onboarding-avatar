import type { Avatar, Flow } from './types';
export const defaultAvatar: Avatar = { name: 'Riccardo', appearance: 'business_clay', visualStyle: 'editorial', voiceIt: 'Gianni', voiceEn: 'Dennis', speakingRate: 1 };
export const exampleFlow: Flow = {
  id: 'welcome', version: '1', title: 'Conosciamoci', locale: 'it',
  objective: 'Raccogliere il nome, il tipo di attività e le esigenze del cliente per preparare il suo primo accesso.',
  introduction: 'Ciao, sono il tuo assistente per questo primo incontro. Ti farò alcune domande; alla fine potrai controllare tutte le risposte.',
  questions: [
    { id: 'name', type: 'text', required: true, title: 'Come preferisci essere chiamato?', maxLength: 80 },
    { id: 'activity', type: 'single_select', required: true, title: 'In quale contesto userai il servizio?', options: [
      { id: 'personal', label: 'Per me' }, { id: 'business', label: 'Per la mia attività' },
    ] },
    { id: 'teamSize', type: 'number', required: true, title: 'Quante persone ci sono nel tuo gruppo?', min: 1, max: 10000, when: { field: 'activity', values: ['business'] } },
    { id: 'goal', type: 'text', required: true, title: 'Quale risultato vorresti ottenere?', description: 'Descrivi l’esigenza principale per cui stai iniziando a usare il servizio.', maxLength: 1000 },
  ],
};
