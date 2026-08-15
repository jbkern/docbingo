/* Charte d'utilisation de DocBingo — cadre légal, éthique et pédagogique.
   Version 1 (15 août 2026). Incrémenter CHARTER_VERSION côté serveur pour redemander l'acceptation. */
export const CHARTER_VERSION = 1;
export const CHARTER_DATE = '2026-08-15';

export const charter = {
  fr: {
    title: 'Charte d\'utilisation',
    subtitle: 'Cadre légal, éthique et pédagogique de DocBingo — version 1 du 15 août 2026',
    intro: 'DocBingo est un outil de formation par le jeu (serious game) développé à titre personnel par Jean-Baptiste Kern, mis à disposition gratuitement, sans lien avec une institution et sans promotion institutionnelle. En créant un compte ou en utilisant la plateforme, vous acceptez la présente charte, qui complète les mentions légales et les licences (AGPL-3.0 pour le logiciel, CC BY-NC-SA 4.0 pour les contenus).',
    accept: 'J\'ai lu la charte d\'utilisation et je m\'engage à la respecter.',
    acceptBtn: 'Accepter et continuer',
    mustAccept: 'L\'acceptation de la charte est nécessaire pour créer ou importer des questions et des cas cliniques.',
    acceptedOn: 'Charte acceptée le',
    sections: [
      { h: '1. Données non identifiantes — obligation absolue', p: [
        'Les questions, cas cliniques, explications et supports visuels soumis ne doivent contenir aucune donnée permettant d\'identifier directement ou indirectement une personne (patient·e, proche, collègue) : ni nom, ni initiales, ni date de naissance, ni date précise d\'événement, ni lieu de prise en charge, ni numéro de dossier ou d\'assuré·e, ni élément rare rendant la personne reconnaissable.',
        'Tout support visuel (photo, imagerie, tracé, document) doit être anonymisé avant la mise en ligne de la question : suppression des cartouches, identifiants, visages, tatouages ou signes distinctifs, et des métadonnées (DocBingo redimensionne les images mais ne garantit pas l\'effacement de tout élément identifiant — c\'est à l\'auteur·e de le vérifier).',
        'Les cas cliniques sont fictifs ou suffisamment transformés pour ne plus correspondre à une personne réelle. En cas de doute, ne publiez pas.',
        'Ces règles découlent notamment du secret professionnel (art. 321 CP), de la loi fédérale sur la protection des données (LPD, données sensibles relatives à la santé) et des règles déontologiques applicables aux professions de la santé et aux institutions de formation. Elles s\'appliquent également aux échanges avec une intelligence artificielle : ne transmettez jamais de données de patient·es à un service d\'IA.'
      ] },
      { h: '2. Droits d\'auteur des supports', p: [
        'Vous ne pouvez utiliser une image, un schéma, un extrait de texte ou tout autre support que si vous en détenez les droits ou si sa licence l\'autorise (œuvre personnelle, domaine public, licence Creative Commons compatible avec CC BY-NC-SA 4.0). Les captures d\'ouvrages, d\'atlas, d\'articles ou de sites protégés ne sont pas admises sans autorisation. Indiquez la source dans l\'explication lorsque la licence l\'exige (loi fédérale sur le droit d\'auteur, LDA).',
        'En publiant ou en proposant une question, vous confirmez disposer des droits nécessaires et vous placez votre contribution sous licence CC BY-NC-SA 4.0 (attribution « Jean-Baptiste Kern & co-auteurs »), ce qui permet le partage entre instances DocBingo et la réutilisation pédagogique non commerciale.'
      ] },
      { h: '3. Contenus appropriés', p: [
        'Les contenus doivent être exacts au mieux des connaissances actuelles, sourcés lorsque c\'est possible, et rédigés avec respect. Sont exclus les contenus discriminatoires, stigmatisants, dénigrants, à caractère sexuel non justifié par la pédagogie, ou portant atteinte à la dignité des personnes soignées et soignantes.',
        'Les administrateurs relisent les propositions des auteur·es et peuvent modifier, refuser ou retirer tout contenu, sans avoir à le justifier. Toute personne peut signaler un contenu problématique à un·e administrateur·rice.'
      ] },
      { h: '4. Intelligence artificielle', p: [
        'La génération de QCM par IA est une aide à la rédaction : chaque question générée doit être relue, corrigée et validée par un·e professionnel·le avant enregistrement ; DocBingo impose cette étape de relecture. L\'IA peut se tromper — la responsabilité du contenu publié reste celle de l\'auteur·e.',
        'L\'usage de l\'IA doit respecter les règles en vigueur pour l\'utilisateur·rice concerné·e : directives de l\'employeur ou de l\'institution, recommandations des ordres et sociétés professionnelles, conditions du fournisseur d\'IA. La clé API éventuellement configurée est personnelle et engage son titulaire.'
      ] },
      { h: '5. Comptes, données de la plateforme et participant·es', p: [
        'La plateforme enregistre les données strictement nécessaires : adresse email, nom d\'affichage, rôle, contenus créés, paramètres et résultats de sessions (réponses par pseudonyme), statistiques agrégées. Elles sont hébergées dans l\'Union européenne (Render, Francfort · Turso), sauvegardées régulièrement, jamais vendues ni transmises à des tiers à des fins commerciales.',
        'Les participant·es aux sessions rejoignent avec un pseudonyme : n\'entrez pas de nom complet ni d\'autre donnée personnelle. L\'animateur·rice peut supprimer un·e participant·e à tout moment.',
        'Chaque personne peut demander l\'accès, la rectification ou la suppression de ses données à un·e administrateur·rice de son instance. Les mots de passe sont stockés sous forme hachée ; gardez-les confidentiels et signalez tout accès suspect.'
      ] },
      { h: '6. Responsabilité et statut de l\'outil', p: [
        'DocBingo est un outil pédagogique fourni « en l\'état », sans garantie d\'exactitude, de disponibilité ou d\'adéquation à un usage particulier. Il ne constitue ni un dispositif médical, ni une source de recommandations cliniques : les contenus ne remplacent ni la formation officielle, ni les référentiels en vigueur, ni le jugement clinique.',
        'L\'auteur·e d\'une contribution en est seul·e responsable. DocBingo et son créateur ne sauraient être tenus pour responsables du non-respect de la présente charte par les utilisateur·rices, en particulier en cas de publication de données identifiantes, d\'atteinte aux droits d\'auteur ou de contenu inapproprié. Chaque utilisateur·rice se conforme aux règles de son institution, de son employeur et de son ordre professionnel, et au droit qui lui est applicable.',
        'La présente charte est régie par le droit suisse. Elle ne constitue pas un avis juridique ; en cas de doute, consultez votre institution ou un·e juriste.'
      ] },
      { h: '7. Esprit du jeu et bienveillance', p: [
        'DocBingo est conçu pour apprendre en s\'amusant : le classement et les bingos sont des ressorts ludiques, pas des instruments d\'évaluation ni de comparaison entre personnes. L\'animateur·rice veille au climat de la session : encourager, expliquer, dédramatiser l\'erreur, éviter toute mise en difficulté individuelle ou remarque humiliante.',
        'Les contenus et les échanges utilisent, autant que possible, un langage inclusif et épicène (formulations neutres, doublets, point médian), et évitent les stéréotypes.',
        'Merci de contribuer, de jouer et d\'animer dans un esprit de formation, de curiosité et de respect mutuel.'
      ] },
      { h: '8. Acceptation et évolution', p: [
        'L\'acceptation de la charte est enregistrée avec sa date et sa version dans votre compte. En cas de modification substantielle, une nouvelle acceptation vous sera demandée à la connexion suivante. Le texte en vigueur est toujours consultable depuis la rubrique « À propos & mentions légales ».'
      ] }
    ]
  },
  en: {
    title: 'Terms of use',
    subtitle: 'Legal, ethical and educational framework of DocBingo — version 1, 15 August 2026',
    intro: 'DocBingo is a game-based learning tool (serious game) developed personally by Jean-Baptiste Kern and provided free of charge, independently of any institution and without institutional endorsement. By creating an account or using the platform you accept these terms, which complement the legal notice and licences (AGPL-3.0 for the software, CC BY-NC-SA 4.0 for content).',
    accept: 'I have read the terms of use and I undertake to comply with them.',
    acceptBtn: 'Accept and continue',
    mustAccept: 'Accepting the terms is required before creating or importing questions and clinical cases.',
    acceptedOn: 'Terms accepted on',
    sections: [
      { h: '1. Non-identifying data — an absolute rule', p: [
        'Questions, clinical cases, explanations and visual material must not contain any data allowing a person (patient, relative, colleague) to be identified directly or indirectly: no name, initials, date of birth, precise date of an event, care location, file or insurance number, nor any rare feature making the person recognisable.',
        'Any visual material (photo, imaging, tracing, document) must be anonymised before the question goes online: remove labels, identifiers, faces, tattoos or distinctive marks, and metadata (DocBingo resizes images but does not guarantee removal of every identifying element — the author must check).',
        'Clinical cases are fictitious or sufficiently altered so that they no longer match a real person. When in doubt, do not publish.',
        'These rules stem in particular from professional secrecy (art. 321 Swiss Criminal Code), the Federal Act on Data Protection (FADP, sensitive health data) and the professional rules applying to health professions and teaching institutions. They also apply to exchanges with an artificial intelligence: never send patient data to an AI service.'
      ] },
      { h: '2. Copyright of visual material', p: [
        'You may only use an image, diagram, text excerpt or other material if you hold the rights or its licence allows it (own work, public domain, Creative Commons licence compatible with CC BY-NC-SA 4.0). Screenshots of textbooks, atlases, articles or protected websites are not allowed without permission. Credit the source in the explanation where the licence requires it (Swiss Copyright Act).',
        'By publishing or proposing a question you confirm that you hold the necessary rights and you place your contribution under CC BY-NC-SA 4.0 (attribution “Jean-Baptiste Kern & co-authors”), which allows sharing between DocBingo instances and non-commercial educational reuse.'
      ] },
      { h: '3. Appropriate content', p: [
        'Content must be accurate to the best of current knowledge, sourced where possible, and written respectfully. Discriminatory, stigmatising, disparaging or sexual content not justified by teaching purposes, or content undermining the dignity of patients and carers, is excluded.',
        'Administrators review authors\' proposals and may edit, refuse or withdraw any content without having to justify it. Anyone can report problematic content to an administrator.'
      ] },
      { h: '4. Artificial intelligence', p: [
        'AI-generated MCQs are a drafting aid: every generated question must be reviewed, corrected and validated by a professional before saving; DocBingo enforces this review step. AI can be wrong — responsibility for published content remains with the author.',
        'AI use must comply with the rules applying to the user concerned: employer or institution policies, recommendations of professional bodies, terms of the AI provider. Any API key configured is personal and binds its holder.'
      ] },
      { h: '5. Accounts, platform data and participants', p: [
        'The platform stores only what is strictly necessary: email address, display name, role, created content, session settings and results (answers by nickname), aggregated statistics. Data is hosted in the European Union (Render, Frankfurt · Turso), backed up regularly, and never sold or passed to third parties for commercial purposes.',
        'Session participants join with a nickname: do not enter a full name or other personal data. The facilitator can remove a participant at any time.',
        'Anyone may request access to, correction or deletion of their data from an administrator of their instance. Passwords are stored hashed; keep them confidential and report any suspicious access.'
      ] },
      { h: '6. Liability and status of the tool', p: [
        'DocBingo is an educational tool provided “as is”, without warranty of accuracy, availability or fitness for a particular purpose. It is neither a medical device nor a source of clinical recommendations: content does not replace formal training, current guidelines or clinical judgement.',
        'The author of a contribution is solely responsible for it. DocBingo and its creator cannot be held liable for users\' failure to comply with these terms, in particular the publication of identifying data, copyright infringement or inappropriate content. Every user complies with the rules of their institution, employer and professional body, and with the law applicable to them.',
        'These terms are governed by Swiss law. They do not constitute legal advice; when in doubt, consult your institution or a lawyer.'
      ] },
      { h: '7. Spirit of the game and kindness', p: [
        'DocBingo is designed for learning while having fun: rankings and bingos are playful devices, not assessment tools or means of comparing people. The facilitator looks after the atmosphere of the session: encourage, explain, take the drama out of mistakes, avoid singling anyone out or making humiliating remarks.',
        'Content and exchanges use inclusive, gender-neutral language as far as possible and avoid stereotypes.',
        'Thank you for contributing, playing and facilitating in a spirit of learning, curiosity and mutual respect.'
      ] },
      { h: '8. Acceptance and changes', p: [
        'Your acceptance is recorded with its date and version in your account. In case of a substantial change, you will be asked to accept again at your next sign-in. The current text is always available from “About & legal notice”.'
      ] }
    ]
  },
  de: {
    title: 'Nutzungsordnung',
    subtitle: 'Rechtlicher, ethischer und pädagogischer Rahmen von DocBingo — Version 1 vom 15. August 2026',
    intro: 'DocBingo ist ein spielbasiertes Lernwerkzeug (Serious Game), das Jean-Baptiste Kern privat entwickelt hat und kostenlos, unabhängig von jeder Institution und ohne institutionelle Förderung zur Verfügung stellt. Mit dem Erstellen eines Kontos oder der Nutzung der Plattform akzeptieren Sie diese Nutzungsordnung, die das Impressum und die Lizenzen (AGPL-3.0 für die Software, CC BY-NC-SA 4.0 für Inhalte) ergänzt.',
    accept: 'Ich habe die Nutzungsordnung gelesen und verpflichte mich, sie einzuhalten.',
    acceptBtn: 'Akzeptieren und weiter',
    mustAccept: 'Die Annahme der Nutzungsordnung ist erforderlich, um Fragen und klinische Fälle zu erstellen oder zu importieren.',
    acceptedOn: 'Nutzungsordnung akzeptiert am',
    sections: [
      { h: '1. Nicht identifizierende Daten — absolute Pflicht', p: [
        'Eingereichte Fragen, klinische Fälle, Erklärungen und Bildmaterial dürfen keine Daten enthalten, die eine Person (Patient/in, Angehörige, Kolleg/innen) direkt oder indirekt identifizierbar machen: keine Namen, Initialen, Geburtsdaten, genauen Ereignisdaten, Behandlungsorte, Dossier- oder Versichertennummern und keine seltenen Merkmale, die eine Person erkennbar machen.',
        'Jedes Bildmaterial (Foto, Bildgebung, Kurve, Dokument) muss vor der Veröffentlichung der Frage anonymisiert werden: Beschriftungen, Kennungen, Gesichter, Tätowierungen oder besondere Merkmale sowie Metadaten entfernen (DocBingo verkleinert Bilder, garantiert aber nicht die Entfernung aller identifizierenden Elemente — die Autor/innen müssen dies prüfen).',
        'Klinische Fälle sind fiktiv oder so weit verändert, dass sie keiner realen Person mehr entsprechen. Im Zweifel nicht veröffentlichen.',
        'Diese Regeln ergeben sich insbesondere aus dem Berufsgeheimnis (Art. 321 StGB), dem Datenschutzgesetz (DSG, besonders schützenswerte Gesundheitsdaten) und den Standesregeln der Gesundheitsberufe und Bildungsinstitutionen. Sie gelten auch im Austausch mit einer künstlichen Intelligenz: Übermitteln Sie niemals Patientendaten an einen KI-Dienst.'
      ] },
      { h: '2. Urheberrechte am Bildmaterial', p: [
        'Bilder, Schemata, Textauszüge oder anderes Material dürfen nur verwendet werden, wenn Sie die Rechte besitzen oder die Lizenz dies erlaubt (eigenes Werk, gemeinfrei, mit CC BY-NC-SA 4.0 kompatible Creative-Commons-Lizenz). Screenshots aus Lehrbüchern, Atlanten, Artikeln oder geschützten Websites sind ohne Erlaubnis nicht zulässig. Geben Sie die Quelle in der Erklärung an, wenn die Lizenz es verlangt (Urheberrechtsgesetz, URG).',
        'Mit dem Veröffentlichen oder Vorschlagen einer Frage bestätigen Sie, über die nötigen Rechte zu verfügen, und stellen Ihren Beitrag unter CC BY-NC-SA 4.0 (Namensnennung «Jean-Baptiste Kern & Mitautor/innen»), was den Austausch zwischen DocBingo-Instanzen und die nichtkommerzielle pädagogische Weiterverwendung erlaubt.'
      ] },
      { h: '3. Angemessene Inhalte', p: [
        'Inhalte müssen nach bestem aktuellem Wissen korrekt, wenn möglich belegt und respektvoll formuliert sein. Ausgeschlossen sind diskriminierende, stigmatisierende, herabsetzende oder pädagogisch nicht begründete sexuelle Inhalte sowie Inhalte, die die Würde von Patient/innen und Pflegenden verletzen.',
        'Administrator/innen prüfen die Vorschläge der Autor/innen und können Inhalte ohne Begründung ändern, ablehnen oder entfernen. Jede Person kann problematische Inhalte einer Administratorin oder einem Administrator melden.'
      ] },
      { h: '4. Künstliche Intelligenz', p: [
        'KI-generierte MC-Fragen sind eine Schreibhilfe: Jede generierte Frage muss vor dem Speichern von einer Fachperson gegengelesen, korrigiert und freigegeben werden; DocBingo erzwingt diesen Prüfschritt. KI kann sich irren — die Verantwortung für veröffentlichte Inhalte bleibt bei den Autor/innen.',
        'Der KI-Einsatz muss den für die Nutzer/innen geltenden Regeln entsprechen: Weisungen des Arbeitgebers oder der Institution, Empfehlungen der Berufsverbände, Bedingungen des KI-Anbieters. Ein allenfalls hinterlegter API-Schlüssel ist persönlich und verpflichtet seine Inhaberin bzw. seinen Inhaber.'
      ] },
      { h: '5. Konten, Plattformdaten und Teilnehmende', p: [
        'Die Plattform speichert nur das Nötige: E-Mail-Adresse, Anzeigename, Rolle, erstellte Inhalte, Sitzungseinstellungen und -ergebnisse (Antworten pro Pseudonym), aggregierte Statistiken. Die Daten werden in der Europäischen Union gehostet (Render, Frankfurt · Turso), regelmässig gesichert und weder verkauft noch zu kommerziellen Zwecken an Dritte weitergegeben.',
        'Teilnehmende treten mit einem Pseudonym bei: Geben Sie keinen vollständigen Namen und keine anderen persönlichen Daten ein. Die Moderation kann Teilnehmende jederzeit entfernen.',
        'Jede Person kann bei einer Administratorin oder einem Administrator ihrer Instanz Auskunft, Berichtigung oder Löschung ihrer Daten verlangen. Passwörter werden gehasht gespeichert; halten Sie sie geheim und melden Sie verdächtige Zugriffe.'
      ] },
      { h: '6. Haftung und Status des Werkzeugs', p: [
        'DocBingo ist ein pädagogisches Werkzeug, das «wie besehen» ohne Gewähr für Richtigkeit, Verfügbarkeit oder Eignung für einen bestimmten Zweck bereitgestellt wird. Es ist weder ein Medizinprodukt noch eine Quelle klinischer Empfehlungen: Die Inhalte ersetzen weder die offizielle Ausbildung noch geltende Leitlinien noch das klinische Urteil.',
        'Autor/innen sind für ihre Beiträge allein verantwortlich. DocBingo und sein Schöpfer haften nicht für Verstösse der Nutzer/innen gegen diese Nutzungsordnung, insbesondere nicht für die Veröffentlichung identifizierender Daten, Urheberrechtsverletzungen oder unangemessene Inhalte. Alle Nutzer/innen halten die Regeln ihrer Institution, ihres Arbeitgebers und ihres Berufsverbands sowie das für sie geltende Recht ein.',
        'Diese Nutzungsordnung untersteht schweizerischem Recht. Sie stellt keine Rechtsberatung dar; im Zweifel wenden Sie sich an Ihre Institution oder eine Juristin bzw. einen Juristen.'
      ] },
      { h: '7. Spielgeist und Wohlwollen', p: [
        'DocBingo will spielerisch Lernen ermöglichen: Rangliste und Bingos sind Spielelemente, keine Bewertungsinstrumente und kein Personenvergleich. Die Moderation achtet auf das Klima der Sitzung: ermutigen, erklären, Fehler entdramatisieren, niemanden blossstellen, keine verletzenden Bemerkungen.',
        'Inhalte und Austausch verwenden nach Möglichkeit eine inklusive, geschlechtergerechte Sprache und vermeiden Stereotype.',
        'Danke, dass Sie im Geist von Weiterbildung, Neugier und gegenseitigem Respekt beitragen, spielen und moderieren.'
      ] },
      { h: '8. Annahme und Änderungen', p: [
        'Ihre Annahme wird mit Datum und Version in Ihrem Konto gespeichert. Bei wesentlichen Änderungen werden Sie bei der nächsten Anmeldung erneut um Annahme gebeten. Der geltende Text ist jederzeit unter «Über & Impressum» abrufbar.'
      ] }
    ]
  }
};
