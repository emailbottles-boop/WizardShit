-- Seeds the database with the site's current content, so the admin panel
-- starts out matching what's live today.
-- Apply ONCE with: npx wrangler d1 execute wizardshit --remote --file=seed.sql

DELETE FROM merch_items;
DELETE FROM credits;
DELETE FROM donators;

INSERT INTO merch_items (title, url, image, sticker, row_break, visible, sort) VALUES
('EARL CROUCH HOODIE',              'https://wizard.printful.me/product/unisex-hoodie',                 'hoodie-front.png', 0, 0, 1, 0),
('PASS THE HOODIE',                 'https://wizard.printful.me/product/hoodie',                        'hoodie-2.png',     0, 0, 1, 1),
('WIZARD BEANIE',                   'https://wizard.printful.me/product/wizard-beanie',                 'bean.PNG?v=1',     0, 0, 1, 2),
('HELPING HAND TOTE',               'https://wizard.printful.me/product/helping-hand-tote',             'hhtote.PNG?v=1',   0, 0, 1, 3),
('EARL MAP STICKER',                'https://wizard.printful.me/product/die-cut-stickers',              'sticker.png?v=6',  1, 1, 1, 4),
('HOLOGRAPHIC EARL MAP STICKER',    'https://wizard.printful.me/product/holographic-earl-map-sticker',  'hol.PNG?v=1',      1, 0, 1, 5),
('STICKER OF RATH',                 'https://wizard.printful.me/product/sticker-of-rath',               'rath.PNG?v=1',     1, 0, 1, 6),
('HOLOGRAPHIC STICKER OF RATH',     'https://wizard.printful.me/product/holographic-stickers',          'holorat.PNG?v=1',  1, 0, 1, 7),
('HELPING HAND STICKER',            'https://wizard.printful.me/product/hh-sticker',                    'hhsticker.PNG?v=1',1, 0, 1, 8),
('HOLOGRAPHIC HELPING HAND STICKER','https://wizard.printful.me/product/holographic-hh-sticker',        'hhholo.PNG?v=1',   1, 0, 1, 9);

INSERT INTO credits (name, roles, photo, photo_css, back_text, back_quote, back_show_name, visible, sort) VALUES
('Ella Imhof', 'Creator
Owner
Producer
Executive Director
Choreographer
Scene Coordinator
Board of Directors', 'wiz.PNG', 'background-position: center 70%;',
 'Ella (Wizzy) is the backbone of MadamStudio. Wizzy has spent countless hours planning, blueprinting, and assembling this team. Wiz@rdShit is bound to do great things, and if anyone deserves the credit it''s Wiz. Wizzy has cultivated a space where everyone can have fun through comedy, art, music, harm reduction / drug education, love, hate, magic and whatever else you might find in WizardCity.',
 0, 0, 1, 0),
('Emman Paraiso', 'Lead Animator
Clean & Coloring
2D Animation
Character Art', 'Emmz.jpeg', 'background-position: center 20%;',
 'Emman has proven himself to be more than just a crucial part of the WizardShit team. Emmz has helped develop aesthetics sculpting the heart of WizardCity. Emmz is a versatile artist who never falls short of his goals. Emmz produces high quality work in all corners of the animation.',
 0, 0, 1, 1),
('Pau Medrano', 'Background Artist', 'Untitled167_20250322190806.png', '',
 'This is the start of something great', 1, 1, 1, 2),
('Amner Rosales Jr', 'Voice Actor
Gnome King & Gnome Gang', 'IMG_1882.png', 'background-position: center 60%;',
 'wweehh yeah we got Shiz to Smoke. Hope you Chicos and Chicas enjoy the show', 1, 1, 1, 3),
('Sheamus Aaren', 'Background Artist
Concept Artist', 'IMG_3165_-_Edited.jpg', '',
 'What is a story without a scene? And what is a scene without a background? Sheamus has put in hard work for MadamStudio, constructing the atmosphere for Wizard City, as well as making significant contributions to Wiz@rdShit''s concept art.',
 0, 0, 1, 4),
('Robert Stewart', 'Sound Designer
Foley Artist
Sound Engineer
Re-Recording Mixer
Web
Board of Directors', 'rob.png?v=3', 'background-position: center center;',
 'This is my favorite TV show.', 1, 1, 1, 5),
('Finn Pearson', 'Voice Actor
Earl', 'Infinnity.jpg', '',
 'I had a blast recording the lines for Earl and can''t wait for you to see what the entire team has been working their magic on. Squalala!', 1, 1, 1, 6),
('Charbuz', 'Writer
Mentee Animator
Animatic Artist', 'Charbuz.png', '',
 'Charbuz is a writer and mentee animator for Wiz@rdShit. Charbuz is excellent at what they do and MadamStudio is grateful to have amazing partners like Charbuz.',
 0, 0, 1, 7),
('Sapphic Shroom', '2D Animation
Animatic Editor', 'sapphic_shroom_icon.png', '',
 'The credits wouldn''t be complete without Sapphic Shroom. They have worked and supported the development of Wiz@rdShit from the concept art to the pilot. Thank you Sapphic Shroom for all your amazing work.',
 0, 0, 1, 8),
('Tiffany Liu Veprinski', 'Voice Actor
Wish Fish', 'Tiffany.webp', '',
 'Wish Fish is a important character in WizardCity. With WF, the magic in the room is unparalleled and there''s no one who could have done it like Tiffany. MadamStudio is always excited to have Tiffany on the team.',
 0, 0, 1, 9),
('Ann Nicole', '2D Animation
Effects
Animatic Artist', 'anne_nicole.png.png', '',
 'Anne was originally working on the transitions and effects for Wiz@rdShit, and eventually committed their time to the completion of the animatic. Anne is the newest member of MadamStudio, and we are all honored to have them in the studio.',
 0, 0, 1, 10),
('Mohanad Ahmed', '2D Animator', 'IMG_20260326_063725.PNG', 'background-size: 220%; background-position: center 5%;',
 'I enjoy animating characters that gives evil vibes', 1, 1, 1, 11),
('Rowan Ashmore', 'Storyboarding
Character Design
Board of Directors', 'IMG_2293.jpeg', 'background-size: 170%; background-position: 65% center;',
 'Rowan has been a crucial contributor to the storyboard and character design process. She has always been an important, reliable part of the team from day one. Rowan has worked side by side with the director of MadamStudio, helping carry the magic of Wizard City all the way to the finish line.',
 0, 0, 1, 12),
('Several Goblins', 'Voice Actor
Helping Hand', 'Several Goblins.png', '',
 'Consume brand I am associated with.', 1, 1, 1, 13),
('Rathew', 'Rat', 'wrathew.PNG', 'background-size: 130%; background-position: center 40%;',
 'squeak squeak squeak squeak squaek', 1, 1, 1, 14);

INSERT INTO donators (name, visible, sort) VALUES
('chuppa', 1, 0),
('rick jameson', 1, 1),
('HeXaGo', 1, 2),
('eba', 1, 3);
