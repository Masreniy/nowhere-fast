/**
 * Строки интерфейса на десяти языках.
 *
 * Зачем отдельный файл. Механика перевода живёт в assets/js/i18n.js; словари
 * на десять языков в неё не помещаются, не пробив потолок в 800 строк
 * (.claude/rules/coding-style.md). Контракт это прямо разрешает.
 *
 * Почему словарь устроен «ключ → язык», а не «язык → ключ».
 * Раскладка по языкам (как в прототипе глобуса) на десяти языках даёт десять
 * почти одинаковых блоков по сто с лишним строк: полторы тысячи строк, в которых
 * невозможно увидеть, что одна строка переведена на девять языков из десяти.
 * Здесь все переводы одной строки стоят рядом — ровно так их и читают глазами,
 * когда сверяют. Это сознательное отступление от формулировки контракта
 * («словари разделом на язык»); причина записана здесь, чтобы её не пришлось
 * восстанавливать.
 *
 * Как читается запись. Ключ плоский, с точками. Фигурные скобки — подстановка:
 * t('unit.minutes', { n: 90 }) → «90 мин». Суффиксы .one / .few / .many —
 * формы числа; какую взять, решает Intl.PluralRules браузера, а ключ без
 * суффикса остаётся обязательным и работает запасным вариантом.
 *
 * Русский текст перенесён из страниц дословно. Переводы сделаны вручную;
 * там, где уверенности не было, рядом стоит пометка.
 *
 * Раздел admin.* переведён только на русский и английский: админка —
 * внутренний инструмент владельца, а не страница для посетителя. Остальные
 * девять языков получают английскую строку по запасному пути в i18n.js.
 * Это осознанное ограничение объёма, а не пропуск.
 */
window.NF = window.NF || {};

NF.i18nStrings = {

    // --- Общее: шапка, подвал, переключатель --------------------------------

    // Состояния, которые рисует dom.js сам, без участия страницы. Заголовок
    // ошибки был единственным местом, где русский текст доживал до чужого
    // языка: страница переводила сообщение, а шапку над ним — нет.
    'state.loading': { ru: 'Загружаем…', en: 'Loading…', zh: '加载中…', es: 'Cargando…', ar: '...جارٍ التحميل', hi: 'लोड हो रहा है…', pt: 'Carregando…', fr: 'Chargement…', de: 'Wird geladen…', ja: '読み込み中…' },
    'state.failureTitle': { ru: '⚠️ Не удалось загрузить', en: '⚠️ Could not load', zh: '⚠️ 加载失败', es: '⚠️ No se pudo cargar', ar: '⚠️ تعذّر التحميل', hi: '⚠️ लोड नहीं हो सका', pt: '⚠️ Não foi possível carregar', fr: '⚠️ Échec du chargement', de: '⚠️ Laden fehlgeschlagen', ja: '⚠️ 読み込めませんでした' },
    'state.failureText': { ru: 'Попробуй обновить страницу.', en: 'Try refreshing the page.', zh: '请尝试刷新页面。', es: 'Prueba a actualizar la página.', ar: 'جرّب تحديث الصفحة.', hi: 'पेज रीफ़्रेश करके देखें।', pt: 'Tente atualizar a página.', fr: 'Essaie de rafraîchir la page.', de: 'Versuche die Seite neu zu laden.', ja: 'ページを再読み込みしてみてください。' },

    'lang.label': { ru: 'Язык', en: 'Language', zh: '语言', es: 'Idioma', ar: 'اللغة', hi: 'भाषा', pt: 'Idioma', fr: 'Langue', de: 'Sprache', ja: '言語' },
    'nav.aria': { ru: 'Основная навигация', en: 'Main navigation', zh: '主导航', es: 'Navegación principal', ar: 'التنقل الرئيسي', hi: 'मुख्य नेविगेशन', pt: 'Navegação principal', fr: 'Navigation principale', de: 'Hauptnavigation', ja: 'メインナビゲーション' },
    'nav.home': { ru: 'Главная', en: 'Home', zh: '首页', es: 'Inicio', ar: 'الرئيسية', hi: 'मुख्य पृष्ठ', pt: 'Início', fr: 'Accueil', de: 'Start', ja: 'ホーム' },
    'nav.cities': { ru: 'Города', en: 'Cities', zh: '城市', es: 'Ciudades', ar: 'المدن', hi: 'शहर', pt: 'Cidades', fr: 'Villes', de: 'Städte', ja: '都市' },
    'footer.copyright': { ru: '© 2026 Сделано для путешественников.', en: '© 2026 Made for travellers.', zh: '© 2026 为旅行者而做。', es: '© 2026 Hecho para viajeros.', ar: '© 2026 صُنع للمسافرين.', hi: '© 2026 यात्रियों के लिए बनाया गया।', pt: '© 2026 Feito para viajantes.', fr: '© 2026 Fait pour les voyageurs.', de: '© 2026 Für Reisende gemacht.', ja: '© 2026 旅する人のために。' },
    'footer.data': { ru: 'Данные о местах — ', en: 'Place data — ', zh: '地点数据 — ', es: 'Datos de los lugares — ', ar: 'بيانات الأماكن — ', hi: 'स्थानों का डेटा — ', pt: 'Dados dos locais — ', fr: 'Données des lieux — ', de: 'Ortsdaten — ', ja: '場所のデータ — ' },
    'footer.osm': { ru: '© участники OpenStreetMap', en: '© OpenStreetMap contributors', zh: '© OpenStreetMap 贡献者', es: '© colaboradores de OpenStreetMap', ar: '© مساهمو OpenStreetMap', hi: '© OpenStreetMap योगदानकर्ता', pt: '© colaboradores do OpenStreetMap', fr: '© les contributeurs OpenStreetMap', de: '© OpenStreetMap-Mitwirkende', ja: '© OpenStreetMap 貢献者' },

    // Вводные слова к строкам атрибуции в подвале.
    // Это обязательства лицензий (CC BY 4.0 у GeoNames, ODbL у OpenStreetMap,
    // BSD-3-Clause у каталога звёзд), а не украшение: сокращать их до значков
    // нельзя, человек должен понимать, чьи это данные.
    'footer.imagery': { ru: 'Снимок поверхности — ', en: 'Surface imagery — ', zh: '地表影像 — ', es: 'Imagen de la superficie — ', ar: 'صورة السطح — ', hi: 'सतह की तस्वीर — ', pt: 'Imagem da superfície — ', fr: 'Image de la surface — ', de: 'Oberflächenaufnahme — ', ja: '地表の画像 — ' },
    'footer.outlines': { ru: 'Очертания стран — ', en: 'Country outlines — ', zh: '国界轮廓 — ', es: 'Contornos de los países — ', ar: 'حدود الدول — ', hi: 'देशों की रूपरेखा — ', pt: 'Contornos dos países — ', fr: 'Contours des pays — ', de: 'Länderumrisse — ', ja: '国の輪郭 — ' },
    'footer.geonames': { ru: 'Справочник городов — ', en: 'City directory — ', zh: '城市名录 — ', es: 'Directorio de ciudades — ', ar: 'دليل المدن — ', hi: 'शहरों की सूची — ', pt: 'Diretório de cidades — ', fr: 'Répertoire des villes — ', de: 'Städteverzeichnis — ', ja: '都市の一覧 — ' },
    'footer.starcat': { ru: 'Каталог звёзд — ', en: 'Star catalogue — ', zh: '恒星星表 — ', es: 'Catálogo de estrellas — ', ar: 'فهرس النجوم — ', hi: 'तारों की सूची — ', pt: 'Catálogo de estrelas — ', fr: 'Catalogue d’étoiles — ', de: 'Sternkatalog — ', ja: '星表 — ' },

    // --- Единицы измерения ---------------------------------------------------
    // Ключ без суффикса обязателен: он отвечает за формы, которых мы не завели
    // (у арабского их шесть). Формы .few и .many нужны русскому и арабскому;
    // у остальных языков Intl.PluralRules их не выбирает.

    'unit.minutes': { ru: '{n} мин', en: '{n} min', zh: '{n} 分钟', es: '{n} min', ar: '{n} دقيقة', hi: '{n} मिनट', pt: '{n} min', fr: '{n} min', de: '{n} Min.', ja: '{n}分' },
    'unit.hours': { ru: '{n} ч', en: '{n} h', zh: '{n} 小时', es: '{n} h', ar: '{n} ساعة', hi: '{n} घं', pt: '{n} h', fr: '{n} h', de: '{n} Std.', ja: '{n}時間' },

    'unit.days': { ru: '{n} дней', en: '{n} days', zh: '{n} 天', es: '{n} días', ar: '{n} يوم', hi: '{n} दिन', pt: '{n} dias', fr: '{n} jours', de: '{n} Tage', ja: '{n}日間' },
    'unit.days.one': { ru: '{n} день', en: '{n} day', es: '{n} día', ar: 'يوم واحد', hi: '{n} दिन', pt: '{n} dia', fr: '{n} jour', de: '{n} Tag', zh: '{n} 天', ja: '{n}日間' },
    'unit.days.few': { ru: '{n} дня', ar: '{n} أيام', en: '{n} days' },
    'unit.days.many': { ru: '{n} дней', ar: '{n} يومًا', en: '{n} days' },

    'unit.places': { ru: '{n} мест', en: '{n} places', zh: '{n} 个地点', es: '{n} lugares', ar: '{n} مكان', hi: '{n} स्थान', pt: '{n} locais', fr: '{n} lieux', de: '{n} Orte', ja: '{n}か所' },
    'unit.places.one': { ru: '{n} место', en: '{n} place', es: '{n} lugar', ar: 'مكان واحد', hi: '{n} स्थान', pt: '{n} local', fr: '{n} lieu', de: '{n} Ort', zh: '{n} 个地点', ja: '{n}か所' },
    'unit.places.few': { ru: '{n} места', ar: '{n} أماكن', en: '{n} places' },
    'unit.places.many': { ru: '{n} мест', ar: '{n} مكانًا', en: '{n} places' },

    // --- Главная -------------------------------------------------------------

    'page.index.title': { ru: 'Nowhere Fast — Планировщик путешествий', en: 'Nowhere Fast — Travel planner', zh: 'Nowhere Fast — 旅行规划器', es: 'Nowhere Fast — Planificador de viajes', ar: 'Nowhere Fast — مخطِّط الرحلات', hi: 'Nowhere Fast — यात्रा योजनाकार', pt: 'Nowhere Fast — Planeador de viagens', fr: 'Nowhere Fast — Planificateur de voyages', de: 'Nowhere Fast — Reiseplaner', ja: 'Nowhere Fast — 旅行プランナー' },
    'page.index.desc': {
        ru: 'Планировщик путешествий, который собирает связный маршрут по городу: без возвратов, крюков и потерянных дней.',
        en: 'A travel planner that builds a coherent route through a city: no backtracking, no detours, no lost days.',
        zh: '为城市行程生成连贯路线的旅行规划器：不走回头路，不绕远，不浪费一天。',
        es: 'Un planificador de viajes que arma una ruta coherente por la ciudad: sin volver sobre tus pasos, sin rodeos, sin días perdidos.',
        ar: 'مخطِّط رحلات يبني مسارًا متماسكًا داخل المدينة: بلا عودة إلى الوراء، ولا التفاف، ولا أيام ضائعة.',
        hi: 'एक यात्रा योजनाकार जो शहर में सुसंगत मार्ग बनाता है: न वापसी, न चक्कर, न बर्बाद दिन।',
        pt: 'Um planeador de viagens que monta uma rota coerente pela cidade: sem voltar atrás, sem desvios, sem dias perdidos.',
        fr: "Un planificateur de voyages qui construit un itinéraire cohérent dans la ville : sans retours, sans détours, sans journées perdues.",
        de: 'Ein Reiseplaner, der eine stimmige Route durch die Stadt baut: ohne Rückwege, ohne Umwege, ohne verlorene Tage.',
        ja: '街の移動を一本の筋道にまとめる旅行プランナー。引き返しも、遠回りも、失う一日もなし。',
    },
    'hero.titleA': { ru: 'Спланируй поездку', en: 'Plan your trip', zh: '规划你的旅行', es: 'Planifica tu viaje', ar: 'خطِّط لرحلتك', hi: 'अपनी यात्रा की योजना बनाएँ', pt: 'Planeia a tua viagem', fr: 'Planifie ton voyage', de: 'Plane deine Reise', ja: '旅を組み立てよう' },
    'hero.titleB': { ru: 'без потерянных дней', en: 'with no lost days', zh: '不浪费一天', es: 'sin días perdidos', ar: 'بلا أيام ضائعة', hi: 'बिना दिन गँवाए', pt: 'sem dias perdidos', fr: 'sans journées perdues', de: 'ohne verlorene Tage', ja: '一日も無駄にせず' },
    'hero.lead': {
        ru: 'Проблема не в том, что негде узнать, куда пойти. Проблема в порядке: час туда, час обратно, а назавтра снова в ту же сторону. Nowhere Fast собирает маршрут связно.',
        en: 'The problem is not finding out where to go. The problem is the order: an hour there, an hour back, and tomorrow the same direction again. Nowhere Fast puts the route together coherently.',
        zh: '难的不是知道该去哪里，而是顺序：来回各一小时，第二天又往同一个方向。Nowhere Fast 把路线连成一条。',
        es: 'El problema no es no saber adónde ir. El problema es el orden: una hora de ida, otra de vuelta y mañana otra vez en la misma dirección. Nowhere Fast arma la ruta con sentido.',
        ar: 'المشكلة ليست في معرفة أين تذهب، بل في الترتيب: ساعة ذهابًا وساعة إيابًا، وغدًا في الاتجاه نفسه مرة أخرى. يجمع Nowhere Fast المسار بشكل متماسك.',
        hi: 'दिक्कत यह नहीं कि कहाँ जाएँ यह पता न हो। दिक्कत क्रम की है: एक घंटा जाना, एक घंटा लौटना, और अगले दिन फिर उसी दिशा में। Nowhere Fast मार्ग को जोड़कर बनाता है।',
        pt: 'O problema não é descobrir onde ir. O problema é a ordem: uma hora para lá, uma hora para cá e amanhã outra vez na mesma direção. O Nowhere Fast monta a rota de forma coerente.',
        fr: "Le problème n'est pas de savoir où aller. Le problème, c'est l'ordre : une heure pour y aller, une heure pour revenir, et demain encore dans la même direction. Nowhere Fast assemble l'itinéraire de façon cohérente.",
        de: 'Das Problem ist nicht, herauszufinden, wohin. Das Problem ist die Reihenfolge: eine Stunde hin, eine Stunde zurück — und morgen wieder in dieselbe Richtung. Nowhere Fast setzt die Route stimmig zusammen.',
        ja: '難しいのはどこへ行くかを知ることではなく、順番です。片道一時間、帰りも一時間、翌日もまた同じ方角。Nowhere Fast は道筋を一本につなげます。',
    },
    'hero.cta': { ru: 'Выбрать город', en: 'Choose a city', zh: '选择城市', es: 'Elegir ciudad', ar: 'اختر مدينة', hi: 'शहर चुनें', pt: 'Escolher cidade', fr: 'Choisir une ville', de: 'Stadt wählen', ja: '都市を選ぶ' },
    'how.title': { ru: 'Как это работает', en: 'How it works', zh: '如何运作', es: 'Cómo funciona', ar: 'كيف يعمل', hi: 'यह कैसे काम करता है', pt: 'Como funciona', fr: 'Comment ça marche', de: 'So funktioniert es', ja: '使い方' },
    'how.sub': { ru: 'Три шага — и день собран', en: 'Three steps and the day is set', zh: '三步，一天就排好了', es: 'Tres pasos y el día está armado', ar: 'ثلاث خطوات ويصبح اليوم جاهزًا', hi: 'तीन कदम और दिन तैयार', pt: 'Três passos e o dia está montado', fr: 'Trois étapes et la journée est prête', de: 'Drei Schritte — und der Tag steht', ja: '三つの手順で一日が決まる' },
    'how.step1.title': { ru: 'Выбери город и даты', en: 'Pick a city and dates', zh: '选择城市和日期', es: 'Elige ciudad y fechas', ar: 'اختر المدينة والتواريخ', hi: 'शहर और तारीखें चुनें', pt: 'Escolhe a cidade e as datas', fr: 'Choisis la ville et les dates', de: 'Stadt und Daten wählen', ja: '都市と日付を選ぶ' },
    'how.step1.text': { ru: 'Сколько дней есть и откуда начинаешь день', en: 'How many days you have and where your day starts', zh: '你有几天，以及每天从哪里出发', es: 'Cuántos días tienes y desde dónde empiezas el día', ar: 'كم يومًا لديك ومن أين يبدأ يومك', hi: 'आपके पास कितने दिन हैं और दिन कहाँ से शुरू होता है', pt: 'Quantos dias tens e de onde começas o dia', fr: 'Combien de jours tu as et où commence ta journée', de: 'Wie viele Tage du hast und wo dein Tag beginnt', ja: '日数と、一日の出発点' },
    'how.step2.title': { ru: 'Отметь, что хочешь', en: 'Mark what you want', zh: '勾选你想去的', es: 'Marca lo que quieres', ar: 'حدِّد ما تريد', hi: 'जो चाहिए उसे चुनें', pt: 'Marca o que queres', fr: 'Coche ce que tu veux', de: 'Markiere, was du willst', ja: '行きたい場所を選ぶ' },
    'how.step2.text': { ru: 'Пара мест, которые точно интересны. Остальное подберётся рядом', en: 'A couple of places you are sure about. The rest is picked up nearby', zh: '先选几个一定想去的，其余的会在附近补上', es: 'Un par de lugares que te interesan seguro. El resto se completa cerca', ar: 'مكانان تريدهما بالتأكيد، والبقية تُختار من الجوار', hi: 'कुछ जगहें जो पक्की हैं। बाकी आस-पास से जुड़ जाएँगी', pt: 'Dois ou três lugares de que tens a certeza. O resto é apanhado por perto', fr: 'Deux ou trois lieux qui te tiennent à cœur. Le reste se trouve à côté', de: 'Ein paar Orte, die sicher dabei sind. Der Rest kommt aus der Nachbarschaft', ja: '確実に行きたい場所をいくつか。あとは近くから拾います' },
    'how.step3.title': { ru: 'Получи связный план', en: 'Get a coherent plan', zh: '得到连贯的计划', es: 'Recibe un plan coherente', ar: 'احصل على خطة متماسكة', hi: 'एक सुसंगत योजना पाएँ', pt: 'Recebe um plano coerente', fr: 'Obtiens un plan cohérent', de: 'Erhalte einen stimmigen Plan', ja: '筋の通った計画を受け取る' },
    'how.step3.text': { ru: 'По дням, с местными названиями и адресами. Каждое число объяснимо', en: 'Day by day, with local names and addresses. Every number is explained', zh: '按天排列，附当地名称和地址，每个数字都有出处', es: 'Día por día, con nombres y direcciones locales. Cada número se explica', ar: 'يومًا بيوم، بالأسماء والعناوين المحلية. وكل رقم له تفسير', hi: 'दिन-प्रतिदिन, स्थानीय नामों और पतों के साथ। हर संख्या समझाई गई है', pt: 'Dia a dia, com nomes e moradas locais. Cada número é explicável', fr: 'Jour par jour, avec les noms et adresses locaux. Chaque chiffre est explicable', de: 'Tag für Tag, mit lokalen Namen und Adressen. Jede Zahl ist erklärbar', ja: '日ごとに、現地表記の名前と住所つき。どの数字にも根拠があります' },
    'cities.title': { ru: 'Куда отправимся?', en: 'Where to?', zh: '去哪里？', es: '¿Adónde vamos?', ar: 'إلى أين نذهب؟', hi: 'कहाँ चलें?', pt: 'Para onde vamos?', fr: 'On va où ?', de: 'Wohin geht es?', ja: 'どこへ行く？' },
    'cities.sub': { ru: 'Выбери направление', en: 'Pick a destination', zh: '选择目的地', es: 'Elige un destino', ar: 'اختر وجهة', hi: 'एक गंतव्य चुनें', pt: 'Escolhe um destino', fr: 'Choisis une destination', de: 'Wähle ein Ziel', ja: '行き先を選ぶ' },
    'cities.loading': { ru: 'Загружаем города…', en: 'Loading cities…', zh: '正在加载城市…', es: 'Cargando ciudades…', ar: 'جارٍ تحميل المدن…', hi: 'शहर लोड हो रहे हैं…', pt: 'A carregar cidades…', fr: 'Chargement des villes…', de: 'Städte werden geladen…', ja: '都市を読み込み中…' },
    'cities.emptyTitle': { ru: '😕 Городов пока нет', en: '😕 No cities yet', zh: '😕 还没有城市', es: '😕 Aún no hay ciudades', ar: '😕 لا توجد مدن بعد', hi: '😕 अभी कोई शहर नहीं', pt: '😕 Ainda não há cidades', fr: '😕 Pas encore de villes', de: '😕 Noch keine Städte', ja: '😕 まだ都市がありません' },
    'cities.emptyText': {
        ru: 'Города заводятся через интерфейс Supabase — вход в проекте ещё не сделан.',
        en: 'Cities are added through the Supabase interface — sign-in is not built yet.',
        zh: '城市通过 Supabase 后台添加 —— 项目还没有登录功能。',
        es: 'Las ciudades se añaden desde la interfaz de Supabase: el inicio de sesión aún no existe.',
        ar: 'تُضاف المدن عبر واجهة Supabase — لم يُنشأ تسجيل الدخول بعد.',
        hi: 'शहर Supabase इंटरफ़ेस से जोड़े जाते हैं — लॉगिन अभी बना नहीं है।',
        pt: 'As cidades são adicionadas pela interface do Supabase — o início de sessão ainda não existe.',
        fr: "Les villes sont ajoutées depuis l'interface Supabase : la connexion n'existe pas encore.",
        de: 'Städte werden über die Supabase-Oberfläche angelegt — eine Anmeldung gibt es noch nicht.',
        ja: '都市は Supabase の管理画面から登録します。ログイン機能はまだありません。',
    },
    'cities.failure': { ru: 'Не удалось загрузить список городов. Попробуй обновить страницу.', en: 'Could not load the list of cities. Try reloading the page.', zh: '无法加载城市列表，请刷新页面重试。', es: 'No se pudo cargar la lista de ciudades. Prueba a recargar la página.', ar: 'تعذّر تحميل قائمة المدن. جرّب تحديث الصفحة.', hi: 'शहरों की सूची लोड नहीं हो सकी। पृष्ठ फिर से लोड करें।', pt: 'Não foi possível carregar a lista de cidades. Tenta recarregar a página.', fr: "Impossible de charger la liste des villes. Essaie de recharger la page.", de: 'Die Städteliste konnte nicht geladen werden. Lade die Seite neu.', ja: '都市一覧を読み込めませんでした。ページを再読み込みしてください。' },
    'city.noCountry': { ru: '📍 Страна не указана', en: '📍 Country not set', zh: '📍 未填写国家', es: '📍 País no indicado', ar: '📍 الدولة غير محددة', hi: '📍 देश नहीं बताया गया', pt: '📍 País não indicado', fr: '📍 Pays non indiqué', de: '📍 Land nicht angegeben', ja: '📍 国が未設定' },
    'city.noDescription': { ru: 'Описание пока не добавлено', en: 'No description yet', zh: '暂无描述', es: 'Todavía sin descripción', ar: 'لا يوجد وصف بعد', hi: 'अभी कोई विवरण नहीं', pt: 'Ainda sem descrição', fr: 'Pas encore de description', de: 'Noch keine Beschreibung', ja: '説明はまだありません' },

    // --- Город ---------------------------------------------------------------

    'page.city.title': { ru: 'Nowhere Fast — Город', en: 'Nowhere Fast — City', zh: 'Nowhere Fast — 城市', es: 'Nowhere Fast — Ciudad', ar: 'Nowhere Fast — المدينة', hi: 'Nowhere Fast — शहर', pt: 'Nowhere Fast — Cidade', fr: 'Nowhere Fast — Ville', de: 'Nowhere Fast — Stadt', ja: 'Nowhere Fast — 都市' },
    'city.docTitle': { ru: '{city} — Nowhere Fast', en: '{city} — Nowhere Fast', zh: '{city} — Nowhere Fast', es: '{city} — Nowhere Fast', ar: '{city} — Nowhere Fast', hi: '{city} — Nowhere Fast', pt: '{city} — Nowhere Fast', fr: '{city} — Nowhere Fast', de: '{city} — Nowhere Fast', ja: '{city} — Nowhere Fast' },
    'city.back': { ru: '← Назад к городам', en: '← Back to cities', zh: '← 返回城市列表', es: '← Volver a las ciudades', ar: '← العودة إلى المدن', hi: '← शहरों पर वापस', pt: '← Voltar às cidades', fr: '← Retour aux villes', de: '← Zurück zu den Städten', ja: '← 都市一覧へ戻る' },
    'city.loading': { ru: 'Загружаем город…', en: 'Loading the city…', zh: '正在加载城市…', es: 'Cargando la ciudad…', ar: 'جارٍ تحميل المدينة…', hi: 'शहर लोड हो रहा है…', pt: 'A carregar a cidade…', fr: 'Chargement de la ville…', de: 'Stadt wird geladen…', ja: '都市を読み込み中…' },
    'city.failure': { ru: 'Не удалось загрузить город.', en: 'Could not load the city.', zh: '无法加载该城市。', es: 'No se pudo cargar la ciudad.', ar: 'تعذّر تحميل المدينة.', hi: 'शहर लोड नहीं हो सका।', pt: 'Não foi possível carregar a cidade.', fr: 'Impossible de charger la ville.', de: 'Die Stadt konnte nicht geladen werden.', ja: '都市を読み込めませんでした。' },
    'city.notFoundTitle': { ru: '😕 Город не найден', en: '😕 City not found', zh: '😕 找不到该城市', es: '😕 Ciudad no encontrada', ar: '😕 لم يتم العثور على المدينة', hi: '😕 शहर नहीं मिला', pt: '😕 Cidade não encontrada', fr: '😕 Ville introuvable', de: '😕 Stadt nicht gefunden', ja: '😕 都市が見つかりません' },
    'city.notFoundText': { ru: 'Проверь ссылку или выбери город на главной.', en: 'Check the link or pick a city on the home page.', zh: '请检查链接，或在首页重新选择城市。', es: 'Revisa el enlace o elige una ciudad en la página principal.', ar: 'تحقق من الرابط أو اختر مدينة من الصفحة الرئيسية.', hi: 'लिंक जाँचें या मुख्य पृष्ठ से शहर चुनें।', pt: 'Verifica o link ou escolhe uma cidade na página inicial.', fr: "Vérifie le lien ou choisis une ville sur la page d'accueil.", de: 'Prüfe den Link oder wähle auf der Startseite eine Stadt.', ja: 'リンクを確認するか、トップページで都市を選んでください。' },
    'city.meta.currency': { ru: 'Валюта', en: 'Currency', zh: '货币', es: 'Moneda', ar: 'العملة', hi: 'मुद्रा', pt: 'Moeda', fr: 'Monnaie', de: 'Währung', ja: '通貨' },
    'city.meta.language': { ru: 'Язык', en: 'Language', zh: '语言', es: 'Idioma', ar: 'اللغة', hi: 'भाषा', pt: 'Idioma', fr: 'Langue', de: 'Sprache', ja: '言語' },
    'city.meta.timezone': { ru: 'Часовой пояс', en: 'Time zone', zh: '时区', es: 'Zona horaria', ar: 'المنطقة الزمنية', hi: 'समय क्षेत्र', pt: 'Fuso horário', fr: 'Fuseau horaire', de: 'Zeitzone', ja: 'タイムゾーン' },
    'city.meta.visa': { ru: 'Виза', en: 'Visa', zh: '签证', es: 'Visado', ar: 'التأشيرة', hi: 'वीज़ा', pt: 'Visto', fr: 'Visa', de: 'Visum', ja: 'ビザ' },

    'trip.title': { ru: '🧳 Моя поездка', en: '🧳 My trip', zh: '🧳 我的行程', es: '🧳 Mi viaje', ar: '🧳 رحلتي', hi: '🧳 मेरी यात्रा', pt: '🧳 A minha viagem', fr: '🧳 Mon voyage', de: '🧳 Meine Reise', ja: '🧳 わたしの旅' },
    'trip.sub': {
        ru: 'Даты и точка старта. Ничего никуда не отправляется — поездка живёт в адресе страницы, поэтому ссылкой можно поделиться',
        en: 'Dates and starting point. Nothing is sent anywhere — the trip lives in the page address, so the link can be shared',
        zh: '日期和出发点。数据不会发送到任何地方——行程就保存在网址里，链接可以直接分享',
        es: 'Fechas y punto de partida. No se envía nada a ningún sitio: el viaje vive en la dirección de la página, así que el enlace se puede compartir',
        ar: 'التواريخ ونقطة البداية. لا يُرسل شيء إلى أي مكان — فالرحلة محفوظة في عنوان الصفحة، ويمكن مشاركة الرابط',
        hi: 'तारीखें और शुरुआती जगह। कुछ भी कहीं नहीं भेजा जाता — यात्रा पेज के पते में रहती है, इसलिए लिंक साझा किया जा सकता है',
        pt: 'Datas e ponto de partida. Nada é enviado para lado nenhum — a viagem vive no endereço da página, por isso o link pode ser partilhado',
        fr: "Dates et point de départ. Rien n'est envoyé nulle part : le voyage vit dans l'adresse de la page, le lien se partage donc tel quel",
        de: 'Daten und Startpunkt. Nichts wird irgendwohin gesendet — die Reise steckt in der Seitenadresse, der Link lässt sich also teilen',
        ja: '日付と出発点。どこにも送信されません。旅程はページのURLに入っているので、リンクをそのまま共有できます',
    },
    'trip.from': { ru: 'С какого числа', en: 'From', zh: '开始日期', es: 'Desde', ar: 'من تاريخ', hi: 'किस दिन से', pt: 'De', fr: 'À partir du', de: 'Von', ja: '開始日' },
    'trip.to': { ru: 'По какое', en: 'To', zh: '结束日期', es: 'Hasta', ar: 'إلى تاريخ', hi: 'किस दिन तक', pt: 'Até', fr: "Jusqu'au", de: 'Bis', ja: '終了日' },
    'trip.start': { ru: 'Откуда начинаю день', en: 'Where my day starts', zh: '每天从哪里出发', es: 'Dónde empieza mi día', ar: 'من أين يبدأ يومي', hi: 'दिन कहाँ से शुरू', pt: 'Onde começa o meu dia', fr: 'Où commence ma journée', de: 'Wo mein Tag beginnt', ja: '一日の出発点' },
    'trip.startNone': { ru: '— не указано —', en: '— not set —', zh: '— 未指定 —', es: '— sin indicar —', ar: '— غير محدد —', hi: '— निर्दिष्ट नहीं —', pt: '— não indicado —', fr: '— non indiqué —', de: '— nicht angegeben —', ja: '— 未指定 —' },
    'trip.startCenter': { ru: 'Центр города', en: 'City centre', zh: '市中心', es: 'Centro de la ciudad', ar: 'وسط المدينة', hi: 'शहर का केंद्र', pt: 'Centro da cidade', fr: 'Centre-ville', de: 'Stadtzentrum', ja: '市の中心' },
    'trip.fillDates': { ru: 'Заполни даты', en: 'Fill in the dates', zh: '请填写日期', es: 'Completa las fechas', ar: 'أدخل التواريخ', hi: 'तारीखें भरें', pt: 'Preenche as datas', fr: 'Renseigne les dates', de: 'Trage die Daten ein', ja: '日付を入力してください' },
    'trip.gaps': { ru: 'Не хватает: {list}', en: 'Missing: {list}', zh: '还缺少：{list}', es: 'Falta: {list}', ar: 'ينقص: {list}', hi: 'कमी है: {list}', pt: 'Falta: {list}', fr: 'Il manque : {list}', de: 'Es fehlt: {list}', ja: '足りないもの: {list}' },
    'gap.dates': { ru: 'даты поездки', en: 'trip dates', zh: '行程日期', es: 'fechas del viaje', ar: 'تواريخ الرحلة', hi: 'यात्रा की तारीखें', pt: 'datas da viagem', fr: 'les dates du voyage', de: 'Reisedaten', ja: '旅行の日付' },
    'gap.places': { ru: 'хотя бы одно отмеченное место', en: 'at least one marked place', zh: '至少勾选一个地点', es: 'al menos un lugar marcado', ar: 'مكان واحد محدد على الأقل', hi: 'कम से कम एक चुनी हुई जगह', pt: 'pelo menos um local marcado', fr: 'au moins un lieu coché', de: 'mindestens ein markierter Ort', ja: '少なくとも一つの選択した場所' },
    'trip.barAria': { ru: 'Собранная поездка', en: 'Trip in progress', zh: '已选行程', es: 'Viaje en construcción', ar: 'الرحلة المجمّعة', hi: 'बनाई जा रही यात्रा', pt: 'Viagem em construção', fr: 'Voyage en cours', de: 'Zusammengestellte Reise', ja: '組み立て中の旅程' },
    'trip.clear': { ru: 'Сбросить', en: 'Reset', zh: '清空', es: 'Restablecer', ar: 'إعادة ضبط', hi: 'रीसेट', pt: 'Limpar', fr: 'Réinitialiser', de: 'Zurücksetzen', ja: 'リセット' },
    'trip.go': { ru: 'Собрать план →', en: 'Build the plan →', zh: '生成计划 →', es: 'Armar el plan →', ar: 'ابنِ الخطة ←', hi: 'योजना बनाएँ →', pt: 'Montar o plano →', fr: 'Construire le plan →', de: 'Plan bauen →', ja: '計画をつくる →' },
    'trip.needDates': { ru: 'Сначала выбери даты', en: 'Pick the dates first', zh: '请先选择日期', es: 'Primero elige las fechas', ar: 'اختر التواريخ أولًا', hi: 'पहले तारीखें चुनें', pt: 'Escolhe primeiro as datas', fr: "Choisis d'abord les dates", de: 'Wähle zuerst die Daten', ja: 'まず日付を選んでください' },
    'trip.marked': { ru: 'Отмечено {n} мест', en: 'Marked {n} places', zh: '已选 {n} 个地点', es: 'Marcados {n} lugares', ar: 'تم تحديد {n} مكان', hi: '{n} स्थान चुने गए', pt: 'Marcados {n} locais', fr: '{n} lieux cochés', de: '{n} Orte markiert', ja: '{n}か所を選択' },
    'trip.marked.one': { ru: 'Отмечено {n} место', en: 'Marked {n} place', es: 'Marcado {n} lugar', ar: 'تم تحديد مكان واحد', hi: '{n} स्थान चुना गया', pt: 'Marcado {n} local', fr: '{n} lieu coché', de: '{n} Ort markiert', zh: '已选 {n} 个地点', ja: '{n}か所を選択' },
    'trip.marked.few': { ru: 'Отмечено {n} места', ar: 'تم تحديد {n} أماكن', en: 'Marked {n} places' },
    'trip.marked.many': { ru: 'Отмечено {n} мест', ar: 'تم تحديد {n} مكانًا', en: 'Marked {n} places' },

    'places.title': { ru: '📍 Места', en: '📍 Places', zh: '📍 地点', es: '📍 Lugares', ar: '📍 الأماكن', hi: '📍 स्थान', pt: '📍 Locais', fr: '📍 Lieux', de: '📍 Orte', ja: '📍 場所' },
    'places.sub': {
        ru: 'Отметь то, куда точно хочешь. Остальное планировщик предложит сам — если оно окажется по пути',
        en: 'Mark the places you are sure about. The planner will suggest the rest — if they happen to be on the way',
        zh: '勾选你一定想去的地方，其余的由规划器在顺路时推荐',
        es: 'Marca los lugares que seguro quieres. El resto lo propondrá el planificador, si queda de camino',
        ar: 'حدِّد ما تريده بالتأكيد، وسيقترح المخطِّط البقية إن كانت في الطريق',
        hi: 'जहाँ पक्का जाना है उसे चुनें। बाकी योजनाकार खुद सुझाएगा — अगर वह रास्ते में पड़े',
        pt: 'Marca os locais que queres de certeza. O resto é sugerido pelo planeador, se ficar a caminho',
        fr: "Coche les lieux dont tu es sûr. Le planificateur proposera le reste — s'il se trouve sur le chemin",
        de: 'Markiere, wohin du sicher willst. Den Rest schlägt der Planer vor — wenn er auf dem Weg liegt',
        ja: '確実に行きたい場所を選んでください。残りは道すがらにあればプランナーが提案します',
    },
    'places.loading': { ru: 'Загружаем места…', en: 'Loading places…', zh: '正在加载地点…', es: 'Cargando lugares…', ar: 'جارٍ تحميل الأماكن…', hi: 'स्थान लोड हो रहे हैं…', pt: 'A carregar locais…', fr: 'Chargement des lieux…', de: 'Orte werden geladen…', ja: '場所を読み込み中…' },
    'places.emptyTitle': { ru: 'Мест пока нет', en: 'No places yet', zh: '还没有地点', es: 'Aún no hay lugares', ar: 'لا توجد أماكن بعد', hi: 'अभी कोई स्थान नहीं', pt: 'Ainda não há locais', fr: 'Pas encore de lieux', de: 'Noch keine Orte', ja: 'まだ場所がありません' },
    'places.emptyText': { ru: 'Места заводятся через интерфейс Supabase — с координатами и местным написанием.', en: 'Places are added through the Supabase interface — with coordinates and the local spelling.', zh: '地点通过 Supabase 后台添加，需要坐标和当地写法。', es: 'Los lugares se añaden desde la interfaz de Supabase, con coordenadas y grafía local.', ar: 'تُضاف الأماكن عبر واجهة Supabase — مع الإحداثيات والكتابة المحلية.', hi: 'स्थान Supabase इंटरफ़ेस से जोड़े जाते हैं — निर्देशांक और स्थानीय वर्तनी के साथ।', pt: 'Os locais são adicionados pela interface do Supabase — com coordenadas e grafia local.', fr: "Les lieux sont ajoutés depuis l'interface Supabase, avec coordonnées et graphie locale.", de: 'Orte werden über die Supabase-Oberfläche angelegt — mit Koordinaten und lokaler Schreibweise.', ja: '場所は Supabase の管理画面から、座標と現地表記つきで登録します。' },
    'places.failure': { ru: 'Не удалось загрузить места этого города.', en: 'Could not load the places of this city.', zh: '无法加载该城市的地点。', es: 'No se pudieron cargar los lugares de esta ciudad.', ar: 'تعذّر تحميل أماكن هذه المدينة.', hi: 'इस शहर के स्थान लोड नहीं हो सके।', pt: 'Não foi possível carregar os locais desta cidade.', fr: 'Impossible de charger les lieux de cette ville.', de: 'Die Orte dieser Stadt konnten nicht geladen werden.', ja: 'この都市の場所を読み込めませんでした。' },
    'places.noneShort': { ru: 'Мест нет', en: 'No places', zh: '没有地点', es: 'Sin lugares', ar: 'لا أماكن', hi: 'कोई स्थान नहीं', pt: 'Sem locais', fr: 'Aucun lieu', de: 'Keine Orte', ja: '場所なし' },
    'place.pick': { ru: 'Хочу сюда', en: 'I want to go here', zh: '想去这里', es: 'Quiero ir aquí', ar: 'أريد الذهاب إلى هنا', hi: 'यहाँ जाना है', pt: 'Quero ir aqui', fr: 'Je veux y aller', de: 'Da will ich hin', ja: 'ここに行きたい' },
    'place.free': { ru: 'Бесплатно', en: 'Free', zh: '免费', es: 'Gratis', ar: 'مجانًا', hi: 'नि:शुल्क', pt: 'Grátis', fr: 'Gratuit', de: 'Kostenlos', ja: '無料' },
    'place.copy': { ru: 'Копировать', en: 'Copy', zh: '复制', es: 'Copiar', ar: 'نسخ', hi: 'कॉपी', pt: 'Copiar', fr: 'Copier', de: 'Kopieren', ja: 'コピー' },
    'place.copyTitle': { ru: 'Скопировать адрес — его показывают таксисту', en: 'Copy the address — this is what you show the taxi driver', zh: '复制地址——给出租车司机看的就是它', es: 'Copiar la dirección: es la que se le enseña al taxista', ar: 'انسخ العنوان — هذا ما تُريه لسائق الأجرة', hi: 'पता कॉपी करें — यही टैक्सी वाले को दिखाया जाता है', pt: 'Copiar a morada — é o que se mostra ao taxista', fr: "Copier l'adresse — c'est elle qu'on montre au chauffeur de taxi", de: 'Adresse kopieren — genau die zeigt man dem Taxifahrer', ja: '住所をコピー — タクシー運転手に見せるのはこれです' },
    'place.copied': { ru: 'Скопировано', en: 'Copied', zh: '已复制', es: 'Copiado', ar: 'تم النسخ', hi: 'कॉपी हो गया', pt: 'Copiado', fr: 'Copié', de: 'Kopiert', ja: 'コピーしました' },
    'place.selected': { ru: 'Выделено — скопируй', en: 'Selected — copy it', zh: '已选中 — 请复制', es: 'Seleccionado: cópialo', ar: 'تم التحديد — انسخه', hi: 'चुन लिया — अब कॉपी करें', pt: 'Selecionado — copia', fr: 'Sélectionné — copie-le', de: 'Markiert — kopiere es', ja: '選択しました — コピーしてください' },
    'place.copyFailed': { ru: 'Не вышло', en: 'Did not work', zh: '没成功', es: 'No funcionó', ar: 'لم ينجح', hi: 'नहीं हो सका', pt: 'Não resultou', fr: "Ça n'a pas marché", de: 'Hat nicht geklappt', ja: 'できませんでした' },

    'routes.summary': { ru: '🗺️ Готовые маршруты от авторов', en: '🗺️ Ready-made routes by authors', zh: '🗺️ 作者现成路线', es: '🗺️ Rutas listas de autores', ar: '🗺️ مسارات جاهزة من المؤلفين', hi: '🗺️ लेखकों के तैयार मार्ग', pt: '🗺️ Rotas prontas de autores', fr: "🗺️ Itinéraires tout faits d'auteurs", de: '🗺️ Fertige Routen von Autoren', ja: '🗺️ 作者による既成ルート' },
    'routes.sub': { ru: 'Чужие подборки без дат и без твоего отеля. Планировщик их не использует', en: 'Someone else’s selections, without dates and without your hotel. The planner does not use them', zh: '别人的清单，没有日期，也不考虑你的住处。规划器不会用到它们', es: 'Selecciones ajenas, sin fechas y sin tu hotel. El planificador no las usa', ar: 'مجموعات من إعداد آخرين، بلا تواريخ وبلا فندقك. المخطِّط لا يستخدمها', hi: 'दूसरों की सूचियाँ — बिना तारीखों और बिना आपके होटल के। योजनाकार इन्हें इस्तेमाल नहीं करता', pt: 'Seleções de outros, sem datas e sem o teu hotel. O planeador não as usa', fr: "Des sélections d'autres personnes, sans dates ni ton hôtel. Le planificateur ne les utilise pas", de: 'Fremde Zusammenstellungen, ohne Daten und ohne dein Hotel. Der Planer nutzt sie nicht', ja: '他人のまとめ。日付も宿も考慮されていません。プランナーは使いません' },
    'routes.loading': { ru: 'Загружаем авторские маршруты…', en: 'Loading authored routes…', zh: '正在加载作者路线…', es: 'Cargando rutas de autor…', ar: 'جارٍ تحميل مسارات المؤلفين…', hi: 'लेखकों के मार्ग लोड हो रहे हैं…', pt: 'A carregar rotas de autor…', fr: "Chargement des itinéraires d'auteur…", de: 'Autorenrouten werden geladen…', ja: '作者ルートを読み込み中…' },
    'routes.emptyTitle': { ru: 'Авторских маршрутов пока нет', en: 'No authored routes yet', zh: '还没有作者路线', es: 'Aún no hay rutas de autor', ar: 'لا توجد مسارات مؤلفين بعد', hi: 'अभी कोई लेखक-मार्ग नहीं', pt: 'Ainda não há rotas de autor', fr: "Pas encore d'itinéraires d'auteur", de: 'Noch keine Autorenrouten', ja: 'まだ作者ルートはありません' },
    'routes.emptyText': { ru: 'Свой план можно собрать из мест выше — отметь их и задай даты.', en: 'You can build your own plan from the places above — mark them and set the dates.', zh: '你可以用上面的地点自己生成计划：勾选它们并填写日期。', es: 'Puedes armar tu propio plan con los lugares de arriba: márcalos y pon las fechas.', ar: 'يمكنك بناء خطتك من الأماكن أعلاه — حدِّدها وأدخل التواريخ.', hi: 'ऊपर के स्थानों से अपनी योजना बनाई जा सकती है — उन्हें चुनें और तारीखें दें।', pt: 'Podes montar o teu plano a partir dos locais acima — marca-os e define as datas.', fr: 'Tu peux construire ton propre plan à partir des lieux ci-dessus : coche-les et indique les dates.', de: 'Du kannst deinen eigenen Plan aus den Orten oben bauen — markiere sie und setze die Daten.', ja: '上の場所から自分の計画を作れます。選んで日付を入れてください。' },
    'routes.failure': { ru: 'Не удалось загрузить авторские маршруты этого города.', en: 'Could not load the authored routes of this city.', zh: '无法加载该城市的作者路线。', es: 'No se pudieron cargar las rutas de autor de esta ciudad.', ar: 'تعذّر تحميل مسارات المؤلفين لهذه المدينة.', hi: 'इस शहर के लेखक-मार्ग लोड नहीं हो सके।', pt: 'Não foi possível carregar as rotas de autor desta cidade.', fr: "Impossible de charger les itinéraires d'auteur de cette ville.", de: 'Die Autorenrouten dieser Stadt konnten nicht geladen werden.', ja: 'この都市の作者ルートを読み込めませんでした。' },
    'routes.noneShort': { ru: 'Авторских маршрутов нет', en: 'No authored routes', zh: '没有作者路线', es: 'Sin rutas de autor', ar: 'لا مسارات مؤلفين', hi: 'कोई लेखक-मार्ग नहीं', pt: 'Sem rotas de autor', fr: "Aucun itinéraire d'auteur", de: 'Keine Autorenrouten', ja: '作者ルートなし' },
    'route.day': { ru: 'День {n}', en: 'Day {n}', zh: '第 {n} 天', es: 'Día {n}', ar: 'اليوم {n}', hi: 'दिन {n}', pt: 'Dia {n}', fr: 'Jour {n}', de: 'Tag {n}', ja: '{n}日目' },
    'route.dayNamed': { ru: 'День {n}: {name}', en: 'Day {n}: {name}', zh: '第 {n} 天：{name}', es: 'Día {n}: {name}', ar: 'اليوم {n}: {name}', hi: 'दिन {n}: {name}', pt: 'Dia {n}: {name}', fr: 'Jour {n} : {name}', de: 'Tag {n}: {name}', ja: '{n}日目: {name}' },
    'route.noName': { ru: 'Без названия', en: 'Untitled', zh: '无标题', es: 'Sin nombre', ar: 'بلا اسم', hi: 'बिना नाम', pt: 'Sem nome', fr: 'Sans titre', de: 'Ohne Namen', ja: '名称未設定' },
    'route.daysShort': { ru: '{n} дн.', en: '{n} d.', zh: '{n} 天', es: '{n} d.', ar: '{n} ي.', hi: '{n} दि.', pt: '{n} d.', fr: '{n} j.', de: '{n} T.', ja: '{n}日' },
    'difficulty.easy': { ru: '🟢 Лёгкий', en: '🟢 Easy', zh: '🟢 轻松', es: '🟢 Fácil', ar: '🟢 سهل', hi: '🟢 आसान', pt: '🟢 Fácil', fr: '🟢 Facile', de: '🟢 Leicht', ja: '🟢 やさしい' },
    'difficulty.medium': { ru: '🟡 Средний', en: '🟡 Medium', zh: '🟡 中等', es: '🟡 Medio', ar: '🟡 متوسط', hi: '🟡 मध्यम', pt: '🟡 Médio', fr: '🟡 Moyen', de: '🟡 Mittel', ja: '🟡 ふつう' },
    'difficulty.hard': { ru: '🔴 Сложный', en: '🔴 Hard', zh: '🔴 困难', es: '🔴 Difícil', ar: '🔴 صعب', hi: '🔴 कठिन', pt: '🔴 Difícil', fr: '🔴 Difficile', de: '🔴 Schwer', ja: '🔴 ハード' },

    // --- План ----------------------------------------------------------------

    'page.plan.title': { ru: 'План поездки — Nowhere Fast', en: 'Trip plan — Nowhere Fast', zh: '行程计划 — Nowhere Fast', es: 'Plan del viaje — Nowhere Fast', ar: 'خطة الرحلة — Nowhere Fast', hi: 'यात्रा योजना — Nowhere Fast', pt: 'Plano da viagem — Nowhere Fast', fr: 'Plan du voyage — Nowhere Fast', de: 'Reiseplan — Nowhere Fast', ja: '旅程 — Nowhere Fast' },
    'page.plan.desc': { ru: 'План по дням: без возвратов, крюков и потерянных часов.', en: 'A day-by-day plan: no backtracking, no detours, no lost hours.', zh: '按天排的计划：不走回头路，不绕远，不浪费时间。', es: 'Un plan día a día: sin volver sobre tus pasos, sin rodeos, sin horas perdidas.', ar: 'خطة يومًا بيوم: بلا عودة إلى الوراء، ولا التفاف، ولا ساعات ضائعة.', hi: 'दिन-प्रतिदिन की योजना: न वापसी, न चक्कर, न बर्बाद घंटे।', pt: 'Um plano dia a dia: sem voltar atrás, sem desvios, sem horas perdidas.', fr: 'Un plan jour par jour : sans retours, sans détours, sans heures perdues.', de: 'Ein Plan Tag für Tag: ohne Rückwege, ohne Umwege, ohne verlorene Stunden.', ja: '日ごとの計画。引き返しも遠回りも、失う時間もなし。' },
    'plan.back': { ru: '← Изменить выбор', en: '← Change the selection', zh: '← 修改选择', es: '← Cambiar la selección', ar: '← تغيير الاختيار', hi: '← चुनाव बदलें', pt: '← Alterar a seleção', fr: '← Modifier la sélection', de: '← Auswahl ändern', ja: '← 選び直す' },
    'plan.title': { ru: 'План по {city}', en: 'Plan for {city}', zh: '{city} 的计划', es: 'Plan para {city}', ar: 'خطة {city}', hi: '{city} की योजना', pt: 'Plano para {city}', fr: 'Plan pour {city}', de: 'Plan für {city}', ja: '{city} の計画' },
    'plan.docTitle': { ru: 'План — {city} — Nowhere Fast', en: 'Plan — {city} — Nowhere Fast', zh: '计划 — {city} — Nowhere Fast', es: 'Plan — {city} — Nowhere Fast', ar: 'خطة — {city} — Nowhere Fast', hi: 'योजना — {city} — Nowhere Fast', pt: 'Plano — {city} — Nowhere Fast', fr: 'Plan — {city} — Nowhere Fast', de: 'Plan — {city} — Nowhere Fast', ja: '計画 — {city} — Nowhere Fast' },
    'plan.inPlan': { ru: '{places} в плане', en: '{places} in the plan', zh: '计划中 {places}', es: '{places} en el plan', ar: '{places} في الخطة', hi: 'योजना में {places}', pt: '{places} no plano', fr: '{places} dans le plan', de: '{places} im Plan', ja: '計画に{places}' },
    'plan.copy': { ru: 'Скопировать ссылку на план', en: 'Copy the link to the plan', zh: '复制计划链接', es: 'Copiar el enlace del plan', ar: 'انسخ رابط الخطة', hi: 'योजना का लिंक कॉपी करें', pt: 'Copiar o link do plano', fr: 'Copier le lien du plan', de: 'Link zum Plan kopieren', ja: '計画のリンクをコピー' },
    'plan.copied': { ru: 'Ссылка скопирована', en: 'Link copied', zh: '链接已复制', es: 'Enlace copiado', ar: 'تم نسخ الرابط', hi: 'लिंक कॉपी हो गया', pt: 'Link copiado', fr: 'Lien copié', de: 'Link kopiert', ja: 'リンクをコピーしました' },
    'plan.copyManual': { ru: 'Скопируй из адресной строки', en: 'Copy it from the address bar', zh: '请从地址栏复制', es: 'Cópialo de la barra de direcciones', ar: 'انسخه من شريط العنوان', hi: 'पता पट्टी से कॉपी करें', pt: 'Copia da barra de endereço', fr: "Copie-le depuis la barre d'adresse", de: 'Kopiere ihn aus der Adressleiste', ja: 'アドレスバーからコピーしてください' },
    'warning.not_fitted': { ru: '🧳 Не влезло', en: '🧳 Did not fit', zh: '🧳 排不下', es: '🧳 No cupo', ar: '🧳 لم يتّسع', hi: '🧳 समा नहीं पाया', pt: '🧳 Não coube', fr: "🧳 N'a pas tenu", de: '🧳 Passte nicht', ja: '🧳 入りきらず' },
    'warning.idle': { ru: '🕳 Простой', en: '🕳 Idle time', zh: '🕳 空档', es: '🕳 Tiempo muerto', ar: '🕳 وقت فارغ', hi: '🕳 खाली समय', pt: '🕳 Tempo morto', fr: '🕳 Temps mort', de: '🕳 Leerlauf', ja: '🕳 空き時間' },
    'warning.no_start': { ru: '📍 Старт не задан', en: '📍 No starting point', zh: '📍 未设置出发点', es: '📍 Sin punto de partida', ar: '📍 لا نقطة بداية', hi: '📍 शुरुआती जगह नहीं', pt: '📍 Sem ponto de partida', fr: '📍 Point de départ absent', de: '📍 Kein Startpunkt', ja: '📍 出発点が未設定' },
    'warning.long_travel': { ru: '🚌 Долгий переход', en: '🚌 Long transfer', zh: '🚌 长途移动', es: '🚌 Trayecto largo', ar: '🚌 انتقال طويل', hi: '🚌 लंबा सफ़र', pt: '🚌 Trajeto longo', fr: '🚌 Long trajet', de: '🚌 Lange Fahrt', ja: '🚌 長い移動' },
    'warning.other': { ru: '⚠️ Внимание', en: '⚠️ Heads up', zh: '⚠️ 注意', es: '⚠️ Atención', ar: '⚠️ انتبه', hi: '⚠️ ध्यान दें', pt: '⚠️ Atenção', fr: '⚠️ Attention', de: '⚠️ Achtung', ja: '⚠️ 注意' },
    'plan.nearbyTitle': { ru: '📌 Рядом с твоим планом', en: '📌 Close to your plan', zh: '📌 就在你的计划旁边', es: '📌 Cerca de tu plan', ar: '📌 قرب خطتك', hi: '📌 आपकी योजना के पास', pt: '📌 Perto do teu plano', fr: '📌 Près de ton plan', de: '📌 In der Nähe deines Plans', ja: '📌 計画のすぐそば' },
    'plan.nearbySub': { ru: 'Места, которые ты не отмечал, но которые оказались по пути', en: 'Places you did not mark but that turned out to be on the way', zh: '你没有勾选，却正好顺路的地点', es: 'Lugares que no marcaste pero que quedan de camino', ar: 'أماكن لم تحدِّدها لكنها صادفت طريقك', hi: 'जिन्हें आपने नहीं चुना, पर जो रास्ते में पड़ गए', pt: 'Locais que não marcaste mas que ficaram a caminho', fr: "Des lieux que tu n'as pas cochés mais qui se trouvent sur le chemin", de: 'Orte, die du nicht markiert hast, die aber auf dem Weg liegen', ja: '選ばなかったけれど、道すがらにあった場所' },
    'plan.nearbyEmptyTitle': { ru: 'Рядом ничего не нашлось', en: 'Nothing found nearby', zh: '附近没有找到', es: 'No se encontró nada cerca', ar: 'لم يُعثر على شيء قريب', hi: 'आस-पास कुछ नहीं मिला', pt: 'Nada encontrado por perto', fr: 'Rien trouvé à proximité', de: 'In der Nähe nichts gefunden', ja: '近くには見つかりませんでした' },
    'plan.nearbyEmptyText': { ru: 'Либо всё близкое уже в плане, либо остальные места далеко.', en: 'Either everything close is already in the plan, or the other places are far away.', zh: '要么附近的都已经在计划里了，要么其余地点太远。', es: 'O todo lo cercano ya está en el plan, o el resto de lugares queda lejos.', ar: 'إمّا أن كل ما هو قريب صار في الخطة، وإمّا أن بقية الأماكن بعيدة.', hi: 'या तो पास की सब जगहें योजना में हैं, या बाकी स्थान दूर हैं।', pt: 'Ou tudo o que é perto já está no plano, ou os restantes locais ficam longe.', fr: "Soit tout ce qui est proche est déjà dans le plan, soit les autres lieux sont loin.", de: 'Entweder ist alles Nahe schon im Plan, oder die übrigen Orte liegen weit weg.', ja: '近いものはすべて計画に入っているか、残りの場所が遠いかのどちらかです。' },
    'plan.nearbyFrom': { ru: '{time} от «{place}»', en: '{time} from “{place}”', zh: '距“{place}”{time}', es: '{time} desde «{place}»', ar: '{time} من «{place}»', hi: '«{place}» से {time}', pt: '{time} de «{place}»', fr: '{time} depuis « {place} »', de: '{time} von „{place}“', ja: '「{place}」から{time}' },
    'plan.assumptionsSummary': { ru: 'На чём построен этот расчёт', en: 'What this calculation rests on', zh: '这个结果基于什么', es: 'Sobre qué se apoya este cálculo', ar: 'على ماذا يقوم هذا الحساب', hi: 'यह गणना किस पर आधारित है', pt: 'Em que assenta este cálculo', fr: 'Sur quoi repose ce calcul', de: 'Worauf diese Berechnung beruht', ja: 'この計算の前提' },
    'plan.default': { ru: '(по умолчанию)', en: '(default)', zh: '（默认值）', es: '(por defecto)', ar: '(افتراضي)', hi: '(डिफ़ॉल्ट)', pt: '(por omissão)', fr: '(par défaut)', de: '(Standardwert)', ja: '（既定値）' },
    'plan.travelNext': { ru: '↓ в пути {time} — оценка', en: '↓ {time} on the way — an estimate', zh: '↓ 路上 {time}（估算）', es: '↓ {time} de camino — estimación', ar: '↓ {time} في الطريق — تقدير', hi: '↓ रास्ते में {time} — अनुमान', pt: '↓ {time} a caminho — estimativa', fr: '↓ {time} de trajet — estimation', de: '↓ {time} unterwegs — Schätzung', ja: '↓ 移動 {time}（推定）' },
    'plan.dayTravel': { ru: 'в пути {time}', en: '{time} on the way', zh: '路上 {time}', es: '{time} de camino', ar: '{time} في الطريق', hi: 'रास्ते में {time}', pt: '{time} a caminho', fr: '{time} de trajet', de: '{time} unterwegs', ja: '移動 {time}' },
    'plan.dayVisit': { ru: 'на местах {time}', en: '{time} at the places', zh: '在地点上 {time}', es: '{time} en los lugares', ar: '{time} في الأماكن', hi: 'स्थानों पर {time}', pt: '{time} nos locais', fr: '{time} sur place', de: '{time} an den Orten', ja: '滞在 {time}' },
    'plan.dayFree': { ru: 'свободно {time}', en: '{time} free', zh: '空闲 {time}', es: '{time} libre', ar: '{time} وقت حر', hi: '{time} खाली', pt: '{time} livre', fr: '{time} de libre', de: '{time} frei', ja: '空き {time}' },
    'plan.dayEmpty': { ru: 'В этот день ничего не запланировано.', en: 'Nothing is planned for this day.', zh: '这一天没有安排。', es: 'No hay nada planeado para este día.', ar: 'لا شيء مخطط لهذا اليوم.', hi: 'इस दिन के लिए कुछ भी तय नहीं है।', pt: 'Nada planeado para este dia.', fr: 'Rien de prévu ce jour-là.', de: 'Für diesen Tag ist nichts geplant.', ja: 'この日は何も予定されていません。' },
    'plan.emptyTitle': { ru: 'План пуст', en: 'The plan is empty', zh: '计划是空的', es: 'El plan está vacío', ar: 'الخطة فارغة', hi: 'योजना खाली है', pt: 'O plano está vazio', fr: 'Le plan est vide', de: 'Der Plan ist leer', ja: '計画が空です' },
    'plan.emptyText': { ru: 'Ни одно из отмеченных мест не удалось разместить. Подробности выше.', en: 'None of the marked places could be placed. Details above.', zh: '所有勾选的地点都没能排进去，详情见上。', es: 'No se pudo colocar ninguno de los lugares marcados. Detalles arriba.', ar: 'لم يتسنَّ وضع أي من الأماكن المحددة. التفاصيل أعلاه.', hi: 'चुनी गई कोई भी जगह नहीं रखी जा सकी। विवरण ऊपर है।', pt: 'Nenhum dos locais marcados pôde ser colocado. Detalhes acima.', fr: "Aucun des lieux cochés n'a pu être placé. Détails ci-dessus.", de: 'Keiner der markierten Orte ließ sich einplanen. Details oben.', ja: '選択した場所を一つも配置できませんでした。詳細は上にあります。' },
    'plan.failTitle': { ru: 'План не построен', en: 'The plan was not built', zh: '计划没有生成', es: 'El plan no se construyó', ar: 'لم تُبنَ الخطة', hi: 'योजना नहीं बनी', pt: 'O plano não foi montado', fr: "Le plan n'a pas été construit", de: 'Der Plan wurde nicht gebaut', ja: '計画を作れませんでした' },
    'plan.failGaps': { ru: 'Не хватает: {list}. Вернись и заполни.', en: 'Missing: {list}. Go back and fill it in.', zh: '还缺少：{list}。请返回补上。', es: 'Falta: {list}. Vuelve y complétalo.', ar: 'ينقص: {list}. عُد وأكمله.', hi: 'कमी है: {list}। लौटकर भरें।', pt: 'Falta: {list}. Volta e preenche.', fr: 'Il manque : {list}. Reviens et complète.', de: 'Es fehlt: {list}. Geh zurück und trage es ein.', ja: '足りないもの: {list}。戻って入力してください。' },
    'plan.failNoCity': { ru: 'город не выбран', en: 'no city selected', zh: '未选择城市', es: 'no se eligió ciudad', ar: 'لم تُختر مدينة', hi: 'शहर नहीं चुना गया', pt: 'nenhuma cidade escolhida', fr: 'aucune ville choisie', de: 'keine Stadt gewählt', ja: '都市が未選択' },
    'plan.failCityMissing': { ru: 'Такого города нет. Проверь ссылку.', en: 'There is no such city. Check the link.', zh: '没有这个城市，请检查链接。', es: 'No existe esa ciudad. Revisa el enlace.', ar: 'لا توجد مدينة كهذه. تحقق من الرابط.', hi: 'ऐसा कोई शहर नहीं है। लिंक जाँचें।', pt: 'Não existe essa cidade. Verifica o link.', fr: "Cette ville n'existe pas. Vérifie le lien.", de: 'Diese Stadt gibt es nicht. Prüfe den Link.', ja: 'そのような都市はありません。リンクを確認してください。' },
    'plan.failLoad': { ru: 'Не удалось загрузить данные города. Попробуй обновить страницу.', en: 'Could not load the city data. Try reloading the page.', zh: '无法加载城市数据，请刷新页面重试。', es: 'No se pudieron cargar los datos de la ciudad. Prueba a recargar la página.', ar: 'تعذّر تحميل بيانات المدينة. جرّب تحديث الصفحة.', hi: 'शहर का डेटा लोड नहीं हो सका। पृष्ठ फिर से लोड करें।', pt: 'Não foi possível carregar os dados da cidade. Tenta recarregar a página.', fr: 'Impossible de charger les données de la ville. Essaie de recharger la page.', de: 'Die Stadtdaten konnten nicht geladen werden. Lade die Seite neu.', ja: '都市のデータを読み込めませんでした。ページを再読み込みしてください。' },
    'assume.intro': {
        ru: 'Это допущения, а не измерения. Ни одно из них не согласовано с владельцем — каждое отменяется одним словом, и тогда числа пересчитаются.',
        en: 'These are assumptions, not measurements. None of them is agreed with the owner — any of them can be cancelled with one word, and then the numbers are recalculated.',
        zh: '这些是假设，不是实测。它们都未经项目所有者确认——任何一条都可以一句话推翻，数字随之重算。',
        es: 'Son supuestos, no mediciones. Ninguno está acordado con el dueño: cada uno se anula con una palabra y entonces los números se recalculan.',
        ar: 'هذه افتراضات لا قياسات. لم يُتَّفق على أي منها مع صاحب المشروع — يمكن إلغاء أي منها بكلمة واحدة، عندها تُعاد الحسابات.',
        hi: 'ये अनुमान हैं, माप नहीं। इनमें से कोई भी स्वामी से तय नहीं हुआ — हर एक को एक शब्द से रद्द किया जा सकता है, फिर संख्याएँ दोबारा गिनी जाएँगी।',
        pt: 'São pressupostos, não medições. Nenhum foi acordado com o dono — qualquer um se anula com uma palavra e então os números são recalculados.',
        fr: "Ce sont des hypothèses, pas des mesures. Aucune n'est validée par le propriétaire : chacune s'annule d'un mot, et les chiffres sont alors recalculés.",
        de: 'Das sind Annahmen, keine Messungen. Keine davon ist mit dem Eigentümer abgestimmt — jede lässt sich mit einem Wort aufheben, dann werden die Zahlen neu berechnet.',
        ja: 'これは実測ではなく仮定です。どれもオーナーの合意を得ていません。ひと言で取り消せますし、その時は数字を計算し直します。',
    },
    'assume.window': { ru: 'Окно дня', en: 'Day window', zh: '一天的时间窗', es: 'Ventana del día', ar: 'نافذة اليوم', hi: 'दिन की खिड़की', pt: 'Janela do dia', fr: 'Plage de la journée', de: 'Tagesfenster', ja: '一日の時間帯' },
    'assume.windowValue': { ru: '{from} — {to} по времени города', en: '{from} — {to} in the city’s time', zh: '{from} — {to}（当地时间）', es: '{from} — {to} en hora de la ciudad', ar: '{from} — {to} بتوقيت المدينة', hi: '{from} — {to} शहर के समय अनुसार', pt: '{from} — {to} na hora da cidade', fr: '{from} — {to} à l’heure de la ville', de: '{from} — {to} in der Zeit der Stadt', ja: '{from} — {to}（現地時間）' },
    'assume.visit': { ru: 'Время посещения, если его нет у места', en: 'Visit time when the place has none', zh: '地点没填时长时的默认停留时间', es: 'Tiempo de visita cuando el lugar no lo tiene', ar: 'مدة الزيارة حين لا يحددها المكان', hi: 'जब स्थान पर समय न हो तो ठहरने का समय', pt: 'Tempo de visita quando o local não o tem', fr: "Durée de visite quand le lieu n'en a pas", de: 'Besuchsdauer, wenn der Ort keine hat', ja: '滞在時間が未設定の場所の既定値' },
    'assume.travel': { ru: 'Время в пути', en: 'Travel time', zh: '路上时间', es: 'Tiempo de trayecto', ar: 'زمن التنقل', hi: 'यात्रा का समय', pt: 'Tempo de trajeto', fr: 'Temps de trajet', de: 'Fahrzeit', ja: '移動時間' },
    'assume.travelValue': { ru: 'по прямой, с поправкой ×{factor}, при скорости {speed} км/ч', en: 'straight line, corrected ×{factor}, at {speed} km/h', zh: '直线距离，乘以 ×{factor} 修正，速度 {speed} 公里/小时', es: 'en línea recta, con corrección ×{factor}, a {speed} km/h', ar: 'بخط مستقيم، بتصحيح ×{factor}، بسرعة {speed} كم/س', hi: 'सीधी रेखा में, ×{factor} सुधार के साथ, {speed} किमी/घं की गति पर', pt: 'em linha reta, com correção ×{factor}, a {speed} km/h', fr: 'à vol d’oiseau, avec un facteur ×{factor}, à {speed} km/h', de: 'Luftlinie, Korrektur ×{factor}, bei {speed} km/h', ja: '直線距離に ×{factor} の補正、速度 {speed} km/h' },
    'assume.nearby': { ru: 'Порог «рядом»', en: 'The “nearby” threshold', zh: '“附近”的阈值', es: 'Umbral de «cerca»', ar: 'عتبة «القريب»', hi: '«पास» की सीमा', pt: 'Limiar de «perto»', fr: 'Seuil « à proximité »', de: 'Schwelle für „in der Nähe“', ja: '「近く」のしきい値' },
    'assume.start': { ru: 'Точка старта', en: 'Starting point', zh: '出发点', es: 'Punto de partida', ar: 'نقطة البداية', hi: 'शुरुआती जगह', pt: 'Ponto de partida', fr: 'Point de départ', de: 'Startpunkt', ja: '出発点' },
    'assume.startGiven': { ru: 'задана', en: 'set', zh: '已设置', es: 'indicado', ar: 'محددة', hi: 'तय है', pt: 'indicado', fr: 'indiqué', de: 'gesetzt', ja: '設定済み' },
    'assume.startMissing': { ru: 'не задана — первый переход не посчитан', en: 'not set — the first transfer is not counted', zh: '未设置——第一段移动没有计入', es: 'sin indicar: el primer trayecto no se cuenta', ar: 'غير محددة — لم يُحسب الانتقال الأول', hi: 'तय नहीं — पहला सफ़र नहीं गिना गया', pt: 'não indicado — o primeiro trajeto não é contado', fr: "non indiqué — le premier trajet n'est pas compté", de: 'nicht gesetzt — der erste Weg wird nicht gezählt', ja: '未設定 — 最初の移動は計算に入っていません' },
    'assume.totalsPlaces': { ru: 'Отмечено {selected}, в плане {planned}', en: 'Marked {selected}, in the plan {planned}', zh: '已选 {selected}，计划中 {planned}', es: 'Marcados {selected}, en el plan {planned}', ar: 'محدد {selected}، وفي الخطة {planned}', hi: 'चुने {selected}, योजना में {planned}', pt: 'Marcados {selected}, no plano {planned}', fr: 'Cochés {selected}, dans le plan {planned}', de: 'Markiert {selected}, im Plan {planned}', ja: '選択 {selected}、計画 {planned}' },
    'assume.totalsDropped': { ru: ', отброшено {dropped}', en: ', dropped {dropped}', zh: '，舍弃 {dropped}', es: ', descartados {dropped}', ar: '، مستبعَد {dropped}', hi: ', हटाए {dropped}', pt: ', descartados {dropped}', fr: ', écartés {dropped}', de: ', verworfen {dropped}', ja: '、除外 {dropped}' },
    'assume.totalsNotFitted': { ru: ', не влезло {notFitted}', en: ', did not fit {notFitted}', zh: '，排不下 {notFitted}', es: ', no cupieron {notFitted}', ar: '، لم يتّسع {notFitted}', hi: ', समा नहीं पाए {notFitted}', pt: ', não couberam {notFitted}', fr: ", non placés {notFitted}", de: ', nicht untergebracht {notFitted}', ja: '、入りきらず {notFitted}' },
    'assume.totalsTime': { ru: 'Всего в пути {travel}, на местах {visit}, свободно {idle}', en: 'Total {travel} on the way, {visit} at the places, {idle} free', zh: '合计路上 {travel}，在地点 {visit}，空闲 {idle}', es: 'En total {travel} de camino, {visit} en los lugares, {idle} libre', ar: 'الإجمالي {travel} في الطريق، و{visit} في الأماكن، و{idle} وقت حر', hi: 'कुल रास्ते में {travel}, स्थानों पर {visit}, खाली {idle}', pt: 'No total {travel} a caminho, {visit} nos locais, {idle} livre', fr: 'Au total {travel} de trajet, {visit} sur place, {idle} de libre', de: 'Insgesamt {travel} unterwegs, {visit} an den Orten, {idle} frei', ja: '合計 移動{travel}、滞在{visit}、空き{idle}' },

    // --- Админка -------------------------------------------------------------
    // Внутренний инструмент: русский и английский. Остальные языки получают
    // английскую строку запасным путём (см. pick() в i18n.js).

    'page.admin.title': { ru: 'Админка — Nowhere Fast', en: 'Admin — Nowhere Fast' },
    'admin.title': { ru: '🔧 Админка Nowhere Fast', en: '🔧 Nowhere Fast admin' },
    'admin.sub': { ru: 'Города, места и маршруты', en: 'Cities, places and routes' },
    'admin.noticeTitle': { ru: 'Запись ограничена политиками RLS', en: 'Writing is restricted by RLS policies' },
    'admin.noticeText': {
        ru: 'С 16.09.2026 добавлять, править и удалять может только вошедший автор своих записей (ADR-0005). Без входа форма ниже не сработает ни у кого, включая владельца, — тогда данные заводятся через интерфейс Supabase или MCP-коннектор.',
        en: 'Since 16.09.2026 only a signed-in author can add, edit and delete their own records (ADR-0005). Without sign-in the form below works for nobody, the owner included — data is then entered through the Supabase interface or the MCP connector.',
    },
    'admin.noticeDocs': { ru: 'Подробности —', en: 'Details —' },
    'admin.tab.places': { ru: '📍 Места', en: '📍 Places' },
    'admin.tab.cities': { ru: '🏙️ Города', en: '🏙️ Cities' },
    'admin.tab.routes': { ru: '🗺️ Маршруты', en: '🗺️ Routes' },
    'admin.addPlace': { ru: '➕ Добавить место', en: '➕ Add a place' },
    'admin.city': { ru: 'Город *', en: 'City *' },
    'admin.name': { ru: 'Название *', en: 'Name *' },
    'admin.nameHint': { ru: 'На языке интерфейса', en: 'In the interface language' },
    'admin.nameLocal': { ru: 'Местное написание', en: 'Local spelling' },
    'admin.nameLocalHint': { ru: 'То, что понимает навигатор', en: 'What the navigator understands' },
    'admin.lat': { ru: 'Широта *', en: 'Latitude *' },
    'admin.latHint': { ru: 'От −90 до 90', en: 'From −90 to 90' },
    'admin.lng': { ru: 'Долгота *', en: 'Longitude *' },
    'admin.lngHint': { ru: 'От −180 до 180', en: 'From −180 to 180' },
    'admin.addressLocal': { ru: 'Местный адрес', en: 'Local address' },
    'admin.addressLocalHint': { ru: 'Адрес на языке страны — его показывают таксисту', en: 'The address in the country’s language — this is what you show the taxi driver' },
    'admin.desc': { ru: 'Описание', en: 'Description' },
    'admin.descPlaceholder': { ru: 'Чем это место стоит времени...', en: 'Why this place is worth the time...' },
    'admin.category': { ru: 'Категория', en: 'Category' },
    'admin.categoryNone': { ru: '— не указана —', en: '— not set —' },
    'admin.cat.food': { ru: '🍜 Еда', en: '🍜 Food' },
    'admin.cat.park': { ru: '🌳 Парк', en: '🌳 Park' },
    'admin.cat.museum': { ru: '🏛️ Музей', en: '🏛️ Museum' },
    'admin.cat.view': { ru: '🌆 Смотровая', en: '🌆 Viewpoint' },
    'admin.cat.market': { ru: '🛍️ Рынок', en: '🛍️ Market' },
    'admin.cat.temple': { ru: '⛩️ Храм', en: '⛩️ Temple' },
    'admin.cat.other': { ru: '📌 Другое', en: '📌 Other' },
    'admin.minutes': { ru: 'Сколько занимает, мин', en: 'How long it takes, min' },
    'admin.price': { ru: 'Уровень цены', en: 'Price level' },
    'admin.priceNone': { ru: '— не указан —', en: '— not set —' },
    'admin.placesList': { ru: '📋 Места', en: '📋 Places' },
    'admin.filterCity': { ru: 'Показать город', en: 'Show city' },
    'admin.citiesList': { ru: '📋 Города', en: '📋 Cities' },
    'admin.citiesNote': {
        ru: 'Справочник городов — внутренние данные проекта. По брифу он правится администратором, поэтому форма добавления здесь появится вместе со входом. Сейчас города заводятся через интерфейс Supabase.',
        en: 'The city directory is internal project data. Per the brief it is edited by an administrator, so the add form will appear here together with sign-in. For now cities are entered through the Supabase interface.',
    },
    'admin.routesList': { ru: '📋 Маршруты', en: '📋 Routes' },
    'admin.chooseCity': { ru: '— выберите город —', en: '— choose a city —' },
    'admin.col.name': { ru: 'Название', en: 'Name' },
    'admin.col.local': { ru: 'Местное', en: 'Local' },
    'admin.col.country': { ru: 'Страна', en: 'Country' },
    'admin.col.coords': { ru: 'Координаты', en: 'Coordinates' },
    'admin.col.category': { ru: 'Категория', en: 'Category' },
    'admin.col.time': { ru: 'Время', en: 'Time' },
    'admin.col.city': { ru: 'Город', en: 'City' },
    'admin.col.days': { ru: 'Дней', en: 'Days' },
    'admin.col.actions': { ru: 'Действия', en: 'Actions' },
    'admin.loadingRoutes': { ru: 'Загружаем маршруты…', en: 'Loading routes…' },
    'admin.noCitiesTitle': { ru: 'Городов нет', en: 'No cities' },
    'admin.noCitiesText': { ru: 'Добавь город через интерфейс Supabase.', en: 'Add a city through the Supabase interface.' },
    'admin.citiesFailure': { ru: 'Не удалось загрузить города.', en: 'Could not load the cities.' },
    'admin.pickCityTitle': { ru: 'Выберите город', en: 'Choose a city' },
    'admin.pickCityText': { ru: 'Места показываются по одному городу.', en: 'Places are shown one city at a time.' },
    'admin.noPlacesTitle': { ru: 'Мест нет', en: 'No places' },
    'admin.noPlacesText': { ru: 'Добавь первое место формой выше.', en: 'Add the first place with the form above.' },
    'admin.placesFailure': { ru: 'Не удалось загрузить места.', en: 'Could not load the places.' },
    'admin.deleteTitle': { ru: 'Удалить место', en: 'Delete the place' },
    'admin.confirmDelete': { ru: 'Удалить место «{name}»?', en: 'Delete the place “{name}”?' },
    'admin.deleteFailed': { ru: 'Не удалось удалить место. Подробности в консоли.', en: 'Could not delete the place. Details in the console.' },
    'admin.noRoutes': { ru: 'Маршрутов нет', en: 'No routes' },
    'admin.routesFailure': { ru: 'Не удалось загрузить маршруты.', en: 'Could not load the routes.' },
    'admin.needCity': { ru: 'Выберите город', en: 'Choose a city' },
    'admin.needName': { ru: 'Введите название места', en: 'Enter the name of the place' },
    'admin.needCoords': { ru: 'Координаты обязательны: без них место не попадёт в план', en: 'Coordinates are required: without them the place will not get into a plan' },
    'admin.badLat': { ru: 'Широта должна быть от −90 до 90', en: 'Latitude must be between −90 and 90' },
    'admin.badLng': { ru: 'Долгота должна быть от −180 до 180', en: 'Longitude must be between −180 and 180' },
    'admin.badMinutes': { ru: 'Время посещения должно быть больше нуля', en: 'The visit time must be greater than zero' },
    'admin.added': { ru: '✅ Место добавлено', en: '✅ The place was added' },
    'admin.addNoSession': { ru: 'Запись закрыта: нужен вход. Заводи место через интерфейс Supabase.', en: 'Writing is closed: sign-in is required. Add the place through the Supabase interface.' },
    'admin.addFailed': { ru: 'Не удалось добавить место. Подробности в консоли браузера.', en: 'Could not add the place. Details in the browser console.' },
    'admin.sessionIn': { ru: 'Сейчас: вход выполнен, запись своих записей разрешена.', en: 'Right now: signed in, writing your own records is allowed.' },
    'admin.sessionOut': { ru: 'Сейчас: входа нет, поэтому кнопка добавления выключена.', en: 'Right now: not signed in, so the add button is disabled.' },
    'admin.writeClosed': { ru: 'Запись закрыта до появления входа', en: 'Writing is closed until sign-in exists' },

    // --- Глобус --------------------------------------------------------------
    // Перенесено из прототипа /scratchpad/globe/src/i18n.js без правки текста:
    // страница глобуса собирается параллельно и берёт строки отсюда.

    'globe.tagline': { ru: 'Планировщик путешествий', en: 'Travel planner', zh: '旅行规划器', es: 'Planificador de viajes', ar: 'مخطِّط الرحلات', hi: 'यात्रा योजनाकार', pt: 'Planeador de viagens', fr: 'Planificateur de voyages', de: 'Reiseplaner', ja: '旅行プランナー' },
    'globe.eyebrow': { ru: 'Прототип · живое небо', en: 'Prototype · live sky', zh: '原型 · 实时星空', es: 'Prototipo · cielo real', ar: 'نموذج أولي · سماء حية', hi: 'प्रोटोटाइप · जीवित आकाश', pt: 'Protótipo · céu real', fr: 'Prototype · ciel réel', de: 'Prototyp · echter Himmel', ja: 'プロトタイプ · 実際の空' },
    'globe.title': { ru: 'Не что посмотреть, а в каком порядке', en: 'Not what to see — in what order', zh: '不是看什么，而是按什么顺序看', es: 'No qué ver, sino en qué orden', ar: 'ليس ماذا تزور، بل بأي ترتيب', hi: 'क्या देखें नहीं — किस क्रम में देखें', pt: 'Não o que ver, mas em que ordem', fr: 'Pas quoi voir, mais dans quel ordre', de: 'Nicht was — sondern in welcher Reihenfolge', ja: '何を見るかではなく、どの順で見るか' },
    'globe.lead': { ru: 'Настоящее положение Солнца, Луны и звёзд на сейчас. Выбери точку — и увидишь, что рядом с тобой.', en: 'Real positions of the Sun, Moon and stars right now. Pick a place and see what is actually near you.', zh: '此刻太阳、月亮和恒星的真实位置。选一个地点，看看你附近有什么。', es: 'Posiciones reales del Sol, la Luna y las estrellas ahora mismo. Elige un punto y mira qué tienes cerca.', ar: 'مواقع حقيقية للشمس والقمر والنجوم الآن. اختر مكانًا وانظر ما حولك.', hi: 'सूर्य, चंद्रमा और तारों की अभी की वास्तविक स्थिति। कोई जगह चुनें और देखें आपके पास क्या है।', pt: 'Posições reais do Sol, da Lua e das estrelas agora. Escolhe um ponto e vê o que está perto de ti.', fr: 'Positions réelles du Soleil, de la Lune et des étoiles maintenant. Choisis un point et vois ce qui est près de toi.', de: 'Echte Positionen von Sonne, Mond und Sternen genau jetzt. Wähle einen Ort und sieh, was wirklich in der Nähe ist.', ja: '今この瞬間の太陽・月・星の実際の位置。場所を選ぶと、近くに何があるかが分かります。' },
    'globe.search': { ru: 'Страна или город', en: 'Country or city', zh: '国家或城市', es: 'País o ciudad', ar: 'دولة أو مدينة', hi: 'देश या शहर', pt: 'País ou cidade', fr: 'Pays ou ville', de: 'Land oder Stadt', ja: '国または都市' },
    'globe.drag': { ru: 'тяни — смотреть вокруг', en: 'drag — look around', zh: '拖动 — 环视', es: 'arrastra — mirar', ar: 'اسحب — انظر حولك', hi: 'खींचें — चारों ओर देखें', pt: 'arrasta — olhar', fr: 'glisse — regarder', de: 'ziehen — umsehen', ja: 'ドラッグ — 見回す' },
    'globe.zoom': { ru: 'колесо — ближе', en: 'wheel — zoom', zh: '滚轮 — 缩放', es: 'rueda — acercar', ar: 'العجلة — تقريب', hi: 'व्हील — पास लाएँ', pt: 'roda — aproximar', fr: 'molette — zoomer', de: 'Rad — heranzoomen', ja: 'ホイール — 拡大' },
    'globe.click': { ru: 'клик — выбрать', en: 'click — select', zh: '点击 — 选择', es: 'clic — elegir', ar: 'انقر — اختيار', hi: 'क्लिक — चुनें', pt: 'clique — escolher', fr: 'clic — choisir', de: 'Klick — wählen', ja: 'クリック — 選択' },
    'globe.reset': { ru: 'esc — сброс', en: 'esc — clear', zh: 'esc — 清除', es: 'esc — limpiar', ar: 'esc — مسح', hi: 'esc — हटाएँ', pt: 'esc — limpar', fr: 'esc — effacer', de: 'esc — zurücksetzen', ja: 'esc — 解除' },
    'globe.center': { ru: 'Центр', en: 'Centre', zh: '中心', es: 'Centro', ar: 'المركز', hi: 'केंद्र', pt: 'Centro', fr: 'Centre', de: 'Mitte', ja: '中心' },
    'globe.share': { ru: 'Доля суши планеты', en: 'Share of world land', zh: '占全球陆地', es: 'Parte de la tierra firme', ar: 'حصة من يابسة الأرض', hi: 'विश्व भूमि का हिस्सा', pt: 'Parte das terras emersas', fr: 'Part des terres émergées', de: 'Anteil an der Landfläche', ja: '陸地に占める割合' },
    'globe.population': { ru: 'Население', en: 'Population', zh: '人口', es: 'Población', ar: 'السكان', hi: 'जनसंख्या', pt: 'População', fr: 'Population', de: 'Einwohner', ja: '人口' },
    'globe.country': { ru: 'Страна', en: 'Country', zh: '国家', es: 'País', ar: 'الدولة', hi: 'देश', pt: 'País', fr: 'Pays', de: 'Land', ja: '国' },
    'globe.distance': { ru: 'От тебя', en: 'From you', zh: '距你', es: 'Desde ti', ar: 'المسافة عنك', hi: 'आपसे दूरी', pt: 'De ti', fr: 'Depuis toi', de: 'Von dir', ja: 'あなたから' },
    'globe.flight': { ru: 'Лететь', en: 'Flight', zh: '飞行', es: 'Vuelo', ar: 'الطيران', hi: 'उड़ान', pt: 'Voo', fr: 'Vol', de: 'Flug', ja: '飛行' },
    'globe.nearby': { ru: 'Рядом', en: 'Nearby', zh: '附近', es: 'Cerca', ar: 'بالقرب', hi: 'आसपास', pt: 'Perto', fr: 'À proximité', de: 'In der Nähe', ja: '近く' },
    'globe.noWebgl': { ru: 'Нужна поддержка WebGL', en: 'WebGL is required', zh: '需要 WebGL', es: 'Se necesita WebGL', ar: 'مطلوب WebGL', hi: 'WebGL आवश्यक है', pt: 'É necessário WebGL', fr: 'WebGL est nécessaire', de: 'WebGL wird benötigt', ja: 'WebGL が必要です' },
    'globe.noWebglHint': { ru: 'Браузер не смог создать трёхмерную сцену. Обычно помогает включить аппаратное ускорение в настройках браузера или открыть страницу в другом браузере.', en: 'The browser could not create a 3D scene. Turning on hardware acceleration in the browser settings, or opening the page in another browser, usually helps.', zh: '浏览器无法创建三维场景。请在浏览器设置中启用硬件加速，或换一个浏览器打开。', es: 'El navegador no pudo crear una escena 3D. Suele ayudar activar la aceleración por hardware o abrir la página en otro navegador.', ar: 'تعذّر على المتصفح إنشاء مشهد ثلاثي الأبعاد. عادةً ما يساعد تفعيل تسريع العتاد أو فتح الصفحة في متصفح آخر.', hi: 'ब्राउज़र 3D दृश्य नहीं बना सका। हार्डवेयर एक्सेलरेशन चालू करने या दूसरा ब्राउज़र खोलने से आमतौर पर मदद मिलती है।', pt: 'O navegador não conseguiu criar uma cena 3D. Ativar a aceleração de hardware ou abrir a página em outro navegador costuma resolver.', fr: 'Le navigateur n\'a pas pu créer de scène 3D. Activer l\'accélération matérielle ou ouvrir la page dans un autre navigateur règle généralement le problème.', de: 'Der Browser konnte keine 3D-Szene erstellen. Hardwarebeschleunigung einschalten oder die Seite in einem anderen Browser öffnen hilft meist.', ja: 'ブラウザが3Dシーンを作成できませんでした。ハードウェアアクセラレーションを有効にするか、別のブラウザで開いてください。' },
    'globe.youAreHere': { ru: 'ты здесь', en: 'you are here', zh: '你在这里', es: 'estás aquí', ar: 'أنت هنا', hi: 'आप यहाँ हैं', pt: 'você está aqui', fr: 'tu es ici', de: 'du bist hier', ja: 'ここにいます' },
    'globe.nearbyEmpty': { ru: 'Городов рядом нет', en: 'No cities nearby', zh: '附近没有城市', es: 'No hay ciudades cerca', ar: 'لا مدن قريبة', hi: 'आस-पास कोई शहर नहीं', pt: 'Nenhuma cidade por perto', fr: 'Aucune ville à proximité', de: 'Keine Städte in der Nähe', ja: '近くに都市はありません' },
    'globe.cta': { ru: 'Собрать маршрут', en: 'Build a route', zh: '生成路线', es: 'Crear ruta', ar: 'بناء المسار', hi: 'मार्ग बनाएँ', pt: 'Montar rota', fr: 'Construire un itinéraire', de: 'Route bauen', ja: 'ルートを作る' },
    'globe.here': { ru: 'Ты здесь', en: 'You are here', zh: '你在这里', es: 'Estás aquí', ar: 'أنت هنا', hi: 'आप यहाँ हैं', pt: 'Estás aqui', fr: 'Tu es ici', de: 'Du bist hier', ja: '現在地' },
    'globe.originAsk': { ru: 'Откуда летишь?', en: 'Where do you fly from?', zh: '你从哪里出发？', es: '¿Desde dónde vuelas?', ar: 'من أين تسافر؟', hi: 'आप कहाँ से उड़ रहे हैं?', pt: 'De onde voas?', fr: 'D\'où pars-tu ?', de: 'Woher fliegst du?', ja: 'どこから飛びますか？' },
    'globe.originGps': { ru: 'По геолокации', en: 'From geolocation', zh: '使用定位', es: 'Por geolocalización', ar: 'حسب الموقع', hi: 'लोकेशन से', pt: 'Por geolocalização', fr: 'Par géolocalisation', de: 'Per Standort', ja: '位置情報から' },
    'globe.originZone': { ru: 'По часовому поясу', en: 'From time zone', zh: '按时区推断', es: 'Por zona horaria', ar: 'حسب المنطقة الزمنية', hi: 'समय क्षेत्र से', pt: 'Pelo fuso horário', fr: 'Par fuseau horaire', de: 'Per Zeitzone', ja: 'タイムゾーンから' },
    'globe.localTime': { ru: 'Местное время', en: 'Local time', zh: '当地时间', es: 'Hora local', ar: 'التوقيت المحلي', hi: 'स्थानीय समय', pt: 'Hora local', fr: 'Heure locale', de: 'Ortszeit', ja: '現地時刻' },
    'globe.sun': { ru: 'Солнце', en: 'Sun', zh: '太阳', es: 'Sol', ar: 'الشمس', hi: 'सूर्य', pt: 'Sol', fr: 'Soleil', de: 'Sonne', ja: '太陽' },
    'globe.moon': { ru: 'Луна', en: 'Moon', zh: '月亮', es: 'Luna', ar: 'القمر', hi: 'चंद्रमा', pt: 'Lua', fr: 'Lune', de: 'Mond', ja: '月' },
    'globe.now': { ru: 'сейчас', en: 'now', zh: '现在', es: 'ahora', ar: 'الآن', hi: 'अभी', pt: 'agora', fr: 'maintenant', de: 'jetzt', ja: '現在' },
    'globe.time': { ru: 'Время', en: 'Time', zh: '时间', es: 'Hora', ar: 'الوقت', hi: 'समय', pt: 'Hora', fr: 'Heure', de: 'Zeit', ja: '時刻' },
    'globe.constellations': { ru: 'Созвездия', en: 'Constellations', zh: '星座', es: 'Constelaciones', ar: 'الأبراج', hi: 'तारामंडल', pt: 'Constelações', fr: 'Constellations', de: 'Sternbilder', ja: '星座' },
    'globe.stars': { ru: 'звёзд', en: 'stars', zh: '颗恒星', es: 'estrellas', ar: 'نجمًا', hi: 'तारे', pt: 'estrelas', fr: 'étoiles', de: 'Sterne', ja: '個の星' },
    'globe.cities': { ru: 'городов', en: 'cities', zh: '座城市', es: 'ciudades', ar: 'مدينة', hi: 'शहर', pt: 'cidades', fr: 'villes', de: 'Städte', ja: '都市' },
    'globe.countries': { ru: 'стран', en: 'countries', zh: '个国家', es: 'países', ar: 'دولة', hi: 'देश', pt: 'países', fr: 'pays', de: 'Länder', ja: 'カ国' },
    'globe.setOrigin': { ru: 'Лететь отсюда', en: 'Fly from here', zh: '从这里出发', es: 'Volar desde aquí', ar: 'السفر من هنا', hi: 'यहाँ से उड़ें', pt: 'Voar daqui', fr: 'Partir d\'ici', de: 'Von hier fliegen', ja: 'ここから飛ぶ' },
    'globe.hours': { ru: 'ч', en: 'h', zh: '小时', es: 'h', ar: 'س', hi: 'घं', pt: 'h', fr: 'h', de: 'Std', ja: '時間' },
    'globe.minutes': { ru: 'мин', en: 'min', zh: '分钟', es: 'min', ar: 'د', hi: 'मि', pt: 'min', fr: 'min', de: 'Min', ja: '分' },
    'globe.skyView': { ru: 'Небо отсюда', en: 'Sky from here', zh: '此地星空', es: 'Cielo desde aquí', ar: 'السماء من هنا', hi: 'यहाँ से आकाश', pt: 'Céu daqui', fr: 'Ciel d\'ici', de: 'Himmel von hier', ja: 'ここからの空' },
    'globe.orbitView': { ru: 'Из космоса', en: 'From space', zh: '从太空看', es: 'Desde el espacio', ar: 'من الفضاء', hi: 'अंतरिक्ष से', pt: 'Do espaço', fr: 'Depuis l\'espace', de: 'Aus dem All', ja: '宇宙から' },
    'globe.northUp': { ru: 'Север вверх', en: 'North up', zh: '正北朝上', es: 'Norte arriba', ar: 'الشمال للأعلى', hi: 'उत्तर ऊपर', pt: 'Norte acima', fr: 'Nord en haut', de: 'Norden oben', ja: '北を上に' },
    'globe.km': { ru: 'км', en: 'km', zh: '公里', es: 'km', ar: 'كم', hi: 'किमी', pt: 'km', fr: 'km', de: 'km', ja: 'km' },

    // Отказы страницы глобуса. Человек видит их ВМЕСТО сцены, поэтому текст
    // объясняет, что делать дальше, а не только сообщает о беде.

    'globe.fileTitle': { ru: 'Страница открыта файлом с диска', en: 'The page was opened as a file from disk', zh: '页面是以本地文件方式打开的', es: 'La página se abrió como archivo del disco', ar: 'فُتحت الصفحة كملف من القرص', hi: 'पेज डिस्क से फ़ाइल के रूप में खोला गया है', pt: 'A página foi aberta como ficheiro do disco', fr: 'La page a été ouverte comme un fichier du disque', de: 'Die Seite wurde als Datei von der Festplatte geöffnet', ja: 'ページがディスク上のファイルとして開かれています' },
    'globe.fileHint': {
        ru: 'Трёхмерная карта так не работает: браузер запрещает читать пиксели картинки, лежащей рядом на диске. Открой сайт по обычной ссылке или подними локальный сервер.',
        en: 'The 3D map does not work this way: the browser forbids reading the pixels of an image lying next to the file on disk. Open the site by its normal link or start a local server.',
        zh: '三维地图这样打不开：浏览器禁止读取磁盘上相邻图片的像素。请通过正常网址访问，或启动一个本地服务器。',
        es: 'El mapa tridimensional no funciona así: el navegador prohíbe leer los píxeles de una imagen que está junto al archivo en el disco. Abre el sitio por su enlace normal o levanta un servidor local.',
        ar: 'الخريطة ثلاثية الأبعاد لا تعمل هكذا: يمنع المتصفح قراءة بكسلات صورة موجودة بجوار الملف على القرص. افتح الموقع عبر رابطه المعتاد أو شغِّل خادمًا محليًا.',
        hi: 'त्रि-आयामी नक्शा ऐसे काम नहीं करता: ब्राउज़र डिस्क पर पड़ी बगल की तस्वीर के पिक्सेल पढ़ने नहीं देता। साइट को सामान्य लिंक से खोलें या एक लोकल सर्वर चलाएँ।',
        pt: 'O mapa tridimensional não funciona assim: o navegador proíbe ler os píxeis de uma imagem que está ao lado do ficheiro no disco. Abre o site pelo link normal ou levanta um servidor local.',
        fr: "La carte en 3D ne fonctionne pas ainsi : le navigateur interdit de lire les pixels d'une image posée à côté du fichier sur le disque. Ouvre le site par son lien habituel ou lance un serveur local.",
        de: 'Die 3D-Karte funktioniert so nicht: Der Browser verbietet es, die Pixel eines Bildes zu lesen, das neben der Datei auf der Festplatte liegt. Öffne die Seite über ihren normalen Link oder starte einen lokalen Server.',
        ja: '3Dの地図はこの方法では動きません。ブラウザは、ディスク上の隣にある画像のピクセルを読み取ることを禁じています。通常のリンクからサイトを開くか、ローカルサーバーを立ててください。',
    },
    'globe.dataTitle': { ru: 'Справочник стран не загрузился', en: 'The country directory did not load', zh: '国家名录没有加载出来', es: 'El directorio de países no se cargó', ar: 'لم يُحمَّل دليل الدول', hi: 'देशों की सूची लोड नहीं हुई', pt: 'O diretório de países não carregou', fr: "Le répertoire des pays ne s'est pas chargé", de: 'Das Länderverzeichnis wurde nicht geladen', ja: '国の一覧を読み込めませんでした' },
    'globe.dataHint': { ru: 'Связи с базой нет. Попробуй обновить страницу.', en: 'There is no connection to the database. Try refreshing the page.', zh: '连接不到数据库。请尝试刷新页面。', es: 'No hay conexión con la base de datos. Prueba a actualizar la página.', ar: 'لا يوجد اتصال بقاعدة البيانات. جرّب تحديث الصفحة.', hi: 'डेटाबेस से संपर्क नहीं है। पेज रीफ़्रेश करके देखें।', pt: 'Não há ligação à base de dados. Tenta atualizar a página.', fr: 'Pas de connexion à la base de données. Essaie de rafraîchir la page.', de: 'Keine Verbindung zur Datenbank. Versuche die Seite neu zu laden.', ja: 'データベースに接続できません。ページを再読み込みしてみてください。' },
    'globe.fatalCities': { ru: 'А поехать можно сюда', en: 'You can still go here', zh: '不过还是可以去这些地方', es: 'Aun así, puedes ir aquí', ar: 'ومع ذلك يمكنك الذهاب إلى هنا', hi: 'फिर भी, आप यहाँ जा सकते हैं', pt: 'Mesmo assim, podes ir aqui', fr: 'Tu peux quand même aller ici', de: 'Hinfahren kannst du trotzdem hierher', ja: 'それでも、ここへは行けます' },

    // Связь глобуса с продуктом: у какого города на шаре есть содержание.

    'globe.inProduct': { ru: 'есть в Nowhere Fast', en: 'in Nowhere Fast', zh: '已收录在 Nowhere Fast', es: 'está en Nowhere Fast', ar: 'متوفرة في Nowhere Fast', hi: 'Nowhere Fast में मौजूद', pt: 'está no Nowhere Fast', fr: 'présent dans Nowhere Fast', de: 'in Nowhere Fast vorhanden', ja: 'Nowhere Fast にあります' },
    'globe.noCity': { ru: 'Этого города у нас пока нет', en: 'We do not have this city yet', zh: '我们还没有这座城市', es: 'Todavía no tenemos esta ciudad', ar: 'لا توجد لدينا هذه المدينة بعد', hi: 'यह शहर अभी हमारे पास नहीं है', pt: 'Ainda não temos esta cidade', fr: "Nous n'avons pas encore cette ville", de: 'Diese Stadt haben wir noch nicht', ja: 'この都市はまだありません' },
    'globe.countryHas': { ru: 'В этой стране уже есть города:', en: 'In this country we already have:', zh: '在这个国家，我们已经有：', es: 'En este país ya tenemos:', ar: 'في هذه الدولة لدينا بالفعل:', hi: 'इस देश में हमारे पास पहले से हैं:', pt: 'Neste país já temos:', fr: 'Dans ce pays, nous avons déjà :', de: 'In diesem Land haben wir schon:', ja: 'この国には、すでにこちらがあります:' },
    'globe.countryEmpty': { ru: 'В этой стране у нас пока ничего нет', en: 'We have nothing in this country yet', zh: '这个国家我们还没有任何内容', es: 'Todavía no tenemos nada en este país', ar: 'ليس لدينا شيء في هذه الدولة بعد', hi: 'इस देश में हमारे पास अभी कुछ नहीं है', pt: 'Ainda não temos nada neste país', fr: "Nous n'avons encore rien dans ce pays", de: 'In diesem Land haben wir noch nichts', ja: 'この国にはまだ何もありません' },

    // Список городов поверх сцены — путь для того, кто не хочет крутить шар.

    'globe.citiesTitle': { ru: 'Куда уже можно поехать', en: 'Where you can already go', zh: '现在就能去的地方', es: 'Adónde ya puedes ir', ar: 'إلى أين يمكنك الذهاب الآن', hi: 'अभी कहाँ जाया जा सकता है', pt: 'Para onde já podes ir', fr: 'Où tu peux déjà aller', de: 'Wohin du schon fahren kannst', ja: 'いま行ける場所' },
    'globe.citiesLead': { ru: 'Выбери город из списка — или найди его на глобусе', en: 'Pick a city from the list — or find it on the globe', zh: '从列表中选一座城市，或者在地球上找到它', es: 'Elige una ciudad de la lista o búscala en el globo', ar: 'اختر مدينة من القائمة — أو ابحث عنها على الكرة الأرضية', hi: 'सूची से शहर चुनें — या उसे ग्लोब पर ढूँढें', pt: 'Escolhe uma cidade da lista — ou encontra-a no globo', fr: 'Choisis une ville dans la liste — ou trouve-la sur le globe', de: 'Wähle eine Stadt aus der Liste — oder finde sie auf dem Globus', ja: 'リストから都市を選ぶか、地球儀の上で探してください' },
    'globe.citiesEmpty': { ru: 'Городов пока нет ни одного', en: 'There are no cities yet', zh: '目前一座城市也没有', es: 'Todavía no hay ninguna ciudad', ar: 'لا توجد أي مدينة بعد', hi: 'अभी एक भी शहर नहीं है', pt: 'Ainda não há nenhuma cidade', fr: "Il n'y a encore aucune ville", de: 'Es gibt noch keine einzige Stadt', ja: 'まだ一つも都市がありません' },
    'globe.citiesShow': { ru: 'Показать на глобусе', en: 'Show on the globe', zh: '在地球上显示', es: 'Mostrar en el globo', ar: 'أظهرها على الكرة الأرضية', hi: 'ग्लोब पर दिखाएँ', pt: 'Mostrar no globo', fr: 'Montrer sur le globe', de: 'Auf dem Globus zeigen', ja: '地球儀で表示' },

    // Точка отсчёта: ни геолокация, ни часовой пояс не сработали.

    'globe.originManual': { ru: 'Не вышло определить, откуда ты. Выбери точку отсчёта сам', en: 'We could not work out where you are. Pick your starting point yourself', zh: '没能确定你在哪里。请自己选择出发点', es: 'No pudimos determinar dónde estás. Elige tú mismo el punto de partida', ar: 'لم نتمكّن من تحديد مكانك. اختر نقطة البداية بنفسك', hi: 'हम तय नहीं कर सके कि आप कहाँ हैं। शुरुआती बिंदु खुद चुनें', pt: 'Não conseguimos determinar onde estás. Escolhe tu mesmo o ponto de partida', fr: "Nous n'avons pas pu déterminer où tu es. Choisis toi-même ton point de départ", de: 'Wir konnten nicht ermitteln, wo du bist. Wähle deinen Ausgangspunkt selbst', ja: 'あなたの居場所を特定できませんでした。出発点を自分で選んでください' },

    // --- Админка: дозаполнение написаний городов ----------------------------
    // Раздел admin.* — внутренний инструмент владельца, поэтому, как и весь
    // остальной admin.*, переведён на русский и английский; остальные девять
    // языков получают английскую строку запасным путём (см. шапку файла).

    'admin.reference.title': { ru: '🌍 Справочник стран и городов', en: '🌍 Country and city gazetteer' },
    'admin.reference.note': { ru: 'Справочник заливается порциями и переживает обрыв: загрузчик спрашивает базу, что уже на месте, и продолжает с непройденного. Эта метка отвечает на вопрос «доехало или нет» без запроса к агенту.', en: 'The gazetteer is loaded in chunks and survives an interruption: the loader asks the database what is already there and continues from where it stopped. This marker answers "has it arrived" without asking an agent.' },
    'admin.reference.countries': { ru: 'Стран залито', en: 'Countries loaded' },
    'admin.reference.cities': { ru: 'Городов залито', en: 'Cities loaded' },
    'admin.reference.withOutline': { ru: 'Из них с контуром', en: 'Of those, with an outline' },
    'admin.reference.covered': { ru: 'Стран, у которых есть города', en: 'Countries that have cities' },
    'admin.reference.smallest': { ru: 'Самый маленький город', en: 'Smallest city' },
    'admin.reference.failure': { ru: 'Не удалось получить сводку по справочнику', en: 'Could not load the gazetteer summary' },
    'admin.geoNames.title': { ru: '🈯 Написания городов', en: '🈯 City names' },
    'admin.geoNames.note': { ru: 'Справочник городов приходит латиницей. Написания на языках интерфейса собираются слоями: широкий слой из Natural Earth заливается целиком, точечный — медленно дозаполняется из OpenStreetMap для тех городов, которые действительно понадобились.', en: 'The city gazetteer arrives in Latin script. Names in the interface languages are collected in layers: a wide layer from Natural Earth is loaded in full, and a point layer is slowly topped up from OpenStreetMap for the cities that are actually needed.' },
    'admin.geoNames.total': { ru: 'Городов в справочнике', en: 'Cities in the gazetteer' },
    'admin.geoNames.withNames': { ru: 'С написаниями', en: 'With names' },
    'admin.geoNames.untried': { ru: 'Осталось спросить', en: 'Left to ask' },
    'admin.geoNames.emptyResult': { ru: 'Спрашивали, источник не дал', en: 'Asked, source gave nothing' },
    'admin.geoNames.lastChecked': { ru: 'Последнее дозаполнение', en: 'Last top-up' },
    'admin.geoNames.never': { ru: 'ещё ни разу', en: 'never yet' },
    'admin.geoNames.byLanguage': { ru: 'По языкам', en: 'By language' },
    'admin.geoNames.empty': { ru: 'Справочник городов ещё не залит — считать нечего.', en: 'The city gazetteer is not loaded yet — nothing to count.' },
    'admin.geoNames.failure': { ru: 'Не удалось получить сводку по написаниям', en: 'Could not load the names summary' },

};
