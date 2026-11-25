/**
 * Short connective phrases used by templates (`{{t:key}}`), in every content
 * language the offline planner supports. User-provided content is used as-is;
 * these only fill labels, kickers and CTAs so videos never mix languages.
 */
export const CONTENT_LANGUAGES = ['en', 'he', 'ru', 'ar', 'am', 'es', 'fr', 'de', 'pt', 'it', 'tr', 'uk'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

type P = Record<'en' | 'he' | 'ru' | 'ar' | 'am', string> & Partial<Record<ContentLanguage, string>>;

export const PHRASES: Record<string, P> = {
  follow: { en: 'Follow for more', he: 'עקבו לעוד', ru: 'Подписывайтесь', ar: 'تابعنا للمزيد', am: 'ለተጨማሪ ይከተሉን', es: 'Síguenos para más', fr: 'Abonnez-vous', de: 'Folge für mehr', pt: 'Siga para mais', it: 'Seguici per altro', tr: 'Daha fazlası için takip et', uk: 'Підписуйтесь' },
  subscribe: { en: 'Subscribe', he: 'הירשמו לערוץ', ru: 'Подпишитесь на канал', ar: 'اشترك في القناة', am: 'ይመዝገቡ', es: 'Suscríbete', fr: "S'abonner", de: 'Abonnieren', pt: 'Inscreva-se', it: 'Iscriviti', tr: 'Abone ol', uk: 'Підпишіться' },
  shop_now: { en: 'Shop now', he: 'לקנייה עכשיו', ru: 'Купить сейчас', ar: 'تسوق الآن', am: 'አሁን ይግዙ', es: 'Compra ahora', fr: 'Acheter', de: 'Jetzt kaufen', pt: 'Compre agora', it: 'Acquista ora', tr: 'Hemen al', uk: 'Купити зараз' },
  learn_more: { en: 'Learn more', he: 'לפרטים נוספים', ru: 'Узнать больше', ar: 'اعرف المزيد', am: 'ተጨማሪ ይወቁ', es: 'Más información', fr: 'En savoir plus', de: 'Mehr erfahren', pt: 'Saiba mais', it: 'Scopri di più', tr: 'Daha fazla bilgi', uk: 'Дізнатися більше' },
  book_now: { en: 'Book now', he: 'קבעו עכשיו', ru: 'Записаться', ar: 'احجز الآن', am: 'አሁን ይያዙ', es: 'Reserva ahora', fr: 'Réserver', de: 'Jetzt buchen', pt: 'Reserve agora', it: 'Prenota ora', tr: 'Hemen rezervasyon yap', uk: 'Забронювати' },
  did_you_know: { en: 'Did you know?', he: 'הידעתם?', ru: 'А вы знали?', ar: 'هل تعلم؟', am: 'ያውቃሉ?', es: '¿Sabías que?', fr: 'Le saviez-vous ?', de: 'Wusstest du?', pt: 'Você sabia?', it: 'Lo sapevi?', tr: 'Biliyor muydunuz?', uk: 'Чи знали ви?' },
  myth: { en: 'Myth', he: 'מיתוס', ru: 'Миф', ar: 'خرافة', am: 'አፈ ታሪክ', es: 'Mito', fr: 'Mythe', de: 'Mythos', pt: 'Mito', it: 'Mito', tr: 'Efsane', uk: 'Міф' },
  reality: { en: 'Reality', he: 'מציאות', ru: 'Реальность', ar: 'الحقيقة', am: 'እውነታ', es: 'Realidad', fr: 'Réalité', de: 'Realität', pt: 'Realidade', it: 'Realtà', tr: 'Gerçek', uk: 'Реальність' },
  before: { en: 'Before', he: 'לפני', ru: 'До', ar: 'قبل', am: 'በፊት', es: 'Antes', fr: 'Avant', de: 'Vorher', pt: 'Antes', it: 'Prima', tr: 'Önce', uk: 'До' },
  after: { en: 'After', he: 'אחרי', ru: 'После', ar: 'بعد', am: 'በኋላ', es: 'Después', fr: 'Après', de: 'Nachher', pt: 'Depois', it: 'Dopo', tr: 'Sonra', uk: 'Після' },
  problem: { en: 'The problem', he: 'הבעיה', ru: 'Проблема', ar: 'المشكلة', am: 'ችግሩ', es: 'El problema', fr: 'Le problème', de: 'Das Problem', pt: 'O problema', it: 'Il problema', tr: 'Sorun', uk: 'Проблема' },
  solution: { en: 'The solution', he: 'הפתרון', ru: 'Решение', ar: 'الحل', am: 'መፍትሔው', es: 'La solución', fr: 'La solution', de: 'Die Lösung', pt: 'A solução', it: 'La soluzione', tr: 'Çözüm', uk: 'Рішення' },
  step: { en: 'Step', he: 'שלב', ru: 'Шаг', ar: 'الخطوة', am: 'ደረጃ', es: 'Paso', fr: 'Étape', de: 'Schritt', pt: 'Passo', it: 'Passo', tr: 'Adım', uk: 'Крок' },
  chapter: { en: 'Chapter', he: 'פרק', ru: 'Глава', ar: 'الفصل', am: 'ምዕራፍ', es: 'Capítulo', fr: 'Chapitre', de: 'Kapitel', pt: 'Capítulo', it: 'Capitolo', tr: 'Bölüm', uk: 'Розділ' },
  part: { en: 'Part', he: 'חלק', ru: 'Часть', ar: 'الجزء', am: 'ክፍል', es: 'Parte', fr: 'Partie', de: 'Teil', pt: 'Parte', it: 'Parte', tr: 'Bölüm', uk: 'Частина' },
  limited_time: { en: 'Limited time', he: 'לזמן מוגבל', ru: 'Ограниченное время', ar: 'لفترة محدودة', am: 'ለተወሰነ ጊዜ', es: 'Tiempo limitado', fr: 'Durée limitée', de: 'Nur kurze Zeit', pt: 'Tempo limitado', it: 'Tempo limitato', tr: 'Sınırlı süre', uk: 'Обмежений час' },
  off: { en: 'OFF', he: 'הנחה', ru: 'СКИДКА', ar: 'خصم', am: 'ቅናሽ', es: 'DTO', fr: 'DE RÉDUC', de: 'RABATT', pt: 'OFF', it: 'SCONTO', tr: 'İNDİRİM', uk: 'ЗНИЖКА' },
  breaking: { en: 'Breaking', he: 'מבזק', ru: 'Срочно', ar: 'عاجل', am: 'ሰበር', es: 'Última hora', fr: 'Flash info', de: 'Eilmeldung', pt: 'Urgente', it: 'Ultim’ora', tr: 'Son dakika', uk: 'Терміново' },
  ai_news: { en: 'AI News', he: 'חדשות AI', ru: 'Новости ИИ', ar: 'أخبار الذكاء الاصطناعي', am: 'የAI ዜና', es: 'Noticias IA', fr: 'Actu IA', de: 'KI-News', pt: 'Notícias de IA', it: 'News IA', tr: 'Yapay zekâ haberleri', uk: 'Новини ШІ' },
  tech_news: { en: 'Tech News', he: 'חדשות טכנולוגיה', ru: 'Техно-новости', ar: 'أخبار التقنية', am: 'የቴክኖሎጂ ዜና', es: 'Noticias tech', fr: 'Actu tech', de: 'Tech-News', pt: 'Notícias de tecnologia', it: 'News tech', tr: 'Teknoloji haberleri', uk: 'Техноновини' },
  top: { en: 'Top', he: 'טופ', ru: 'Топ', ar: 'أفضل', am: 'ምርጥ', es: 'Top', fr: 'Top', de: 'Top', pt: 'Top', it: 'Top', tr: 'En iyi', uk: 'Топ' },
  unpopular: { en: 'Unpopular opinion', he: 'דעה לא פופולרית', ru: 'Непопулярное мнение', ar: 'رأي غير شائع', am: 'ተወዳጅ ያልሆነ አስተያየት', es: 'Opinión impopular', fr: 'Avis impopulaire', de: 'Unpopuläre Meinung', pt: 'Opinião impopular', it: 'Opinione impopolare', tr: 'Popüler olmayan görüş', uk: 'Непопулярна думка' },
  storytime: { en: 'Storytime', he: 'זמן סיפור', ru: 'История', ar: 'وقت القصة', am: 'የታሪክ ጊዜ', es: 'Hora del cuento', fr: 'Histoire', de: 'Storytime', pt: 'Hora da história', it: 'Storia', tr: 'Hikâye zamanı', uk: 'Історія' },
  verified_buyer: { en: 'Verified customer', he: 'לקוח מאומת', ru: 'Проверенный клиент', ar: 'عميل موثّق', am: 'የተረጋገጠ ደንበኛ', es: 'Cliente verificado', fr: 'Client vérifié', de: 'Verifizierter Kunde', pt: 'Cliente verificado', it: 'Cliente verificato', tr: 'Doğrulanmış müşteri', uk: 'Перевірений клієнт' },
  why_it_matters: { en: 'Why it matters', he: 'למה זה חשוב', ru: 'Почему это важно', ar: 'لماذا يهم', am: 'ለምን አስፈላጊ ነው', es: 'Por qué importa', fr: 'Pourquoi c’est important', de: 'Warum es wichtig ist', pt: 'Por que importa', it: 'Perché conta', tr: 'Neden önemli', uk: 'Чому це важливо' },
  key_takeaway: { en: 'Key takeaway', he: 'השורה התחתונה', ru: 'Главный вывод', ar: 'الخلاصة', am: 'ዋናው ቁም ነገር', es: 'Conclusión', fr: 'À retenir', de: 'Fazit', pt: 'Conclusão', it: 'In sintesi', tr: 'Ana fikir', uk: 'Головний висновок' },
  the_story: { en: 'The story', he: 'הסיפור', ru: 'История', ar: 'القصة', am: 'ታሪኩ', es: 'La historia', fr: "L'histoire", de: 'Die Geschichte', pt: 'A história', it: 'La storia', tr: 'Hikâye', uk: 'Історія' },
  results: { en: 'Results', he: 'תוצאות', ru: 'Результаты', ar: 'النتائج', am: 'ውጤቶች', es: 'Resultados', fr: 'Résultats', de: 'Ergebnisse', pt: 'Resultados', it: 'Risultati', tr: 'Sonuçlar', uk: 'Результати' },
  now_trending: { en: 'Now trending', he: 'עכשיו בטרנד', ru: 'Сейчас в тренде', ar: 'الأكثر رواجًا', am: 'አሁን ተወዳጅ', es: 'En tendencia', fr: 'Tendance', de: 'Im Trend', pt: 'Em alta', it: 'Di tendenza', tr: 'Trend', uk: 'У тренді' },
  episode: { en: 'Episode', he: 'פרק', ru: 'Эпизод', ar: 'الحلقة', am: 'ክፍል', es: 'Episodio', fr: 'Épisode', de: 'Folge', pt: 'Episódio', it: 'Episodio', tr: 'Bölüm', uk: 'Епізод' },
  host: { en: 'Host', he: 'מנחה', ru: 'Ведущий', ar: 'المقدم', am: 'አቅራቢ', es: 'Presentador', fr: 'Animateur', de: 'Moderation', pt: 'Apresentador', it: 'Conduttore', tr: 'Sunucu', uk: 'Ведучий' },
  guest: { en: 'Guest', he: 'אורח', ru: 'Гость', ar: 'الضيف', am: 'እንግዳ', es: 'Invitado', fr: 'Invité', de: 'Gast', pt: 'Convidado', it: 'Ospite', tr: 'Konuk', uk: 'Гість' },
  new: { en: 'New', he: 'חדש', ru: 'Новинка', ar: 'جديد', am: 'አዲስ', es: 'Nuevo', fr: 'Nouveau', de: 'Neu', pt: 'Novo', it: 'Nuovo', tr: 'Yeni', uk: 'Новинка' },
};

export function phrase(key: string, lang: string): string {
  const p = PHRASES[key];
  if (!p) return key;
  return (p as Record<string, string>)[lang] ?? p.en;
}

/** Approximate narration speed (words per second) per language, for timing estimates. */
export function wordsPerSecond(lang: string): number {
  return ({ en: 2.6, he: 2.3, ru: 2.2, ar: 2.1, am: 1.9, es: 2.7, fr: 2.6, de: 2.3, pt: 2.6, it: 2.6, tr: 2.2, uk: 2.2 } as Record<string, number>)[lang] ?? 2.4;
}

export function isRtlLanguage(lang: string): boolean {
  return lang === 'he' || lang === 'ar' || lang === 'fa' || lang === 'ur';
}
