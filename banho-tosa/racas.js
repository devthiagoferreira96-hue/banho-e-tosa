// =====================================================================
// AGENDA PET – Lista de raças (usada nas sugestões do campo "Raça")
// Cães: raças reconhecidas pela FCI (grupos 1 a 10), raças nacionais do
// grupo 11 da CBKC e raças populares no Brasil. Para incluir uma raça,
// basta acrescentar o nome entre aspas na lista.
// =====================================================================
window.RACAS = window.RACAS || {};

window.RACAS.Canino = [
  // Sem raça
  'SRD (Sem Raça Definida)',

  // Grupo 1 – Cães pastores e boiadeiros
  'Pastor Alemão', 'Pastor Belga Groenendael', 'Pastor Belga Laekenois',
  'Pastor Belga Malinois', 'Pastor Belga Tervueren', 'Pastor Holandês', 'Pastor de Beauce (Beauceron)',
  'Pastor de Brie (Briard)', 'Pastor dos Pirenéus', 'Pastor Picardo', 'Pastor Branco Suíço',
  'Pastor Australiano', 'Pastor de Shetland (Sheltie)', 'Pastor Bergamasco', 'Pastor Maremano Abruzês',
  'Pastor Catalão', 'Pastor de Maiorca (Ca de Bestiar)', 'Pastor Croata', 'Pastor Polonês da Planície',
  'Pastor Polonês de Podhale (Tatra)', 'Pastor Romeno dos Cárpatos', 'Pastor Romeno Mioritic',
  'Pastor Romeno da Bucovina', 'Schapendoes Holandês', 'Border Collie', 'Collie de Pelo Longo',
  'Collie de Pelo Curto', 'Bearded Collie', 'Old English Sheepdog (Bobtail)', 'Kelpie Australiano',
  'Boiadeiro Australiano (Australian Cattle Dog)', 'Boiadeiro Australiano de Cauda Curta',
  'Boiadeiro de Flandres', 'Boiadeiro das Ardenas', 'Welsh Corgi Cardigan', 'Welsh Corgi Pembroke',
  'Puli', 'Pumi', 'Mudi', 'Komondor', 'Kuvasz', 'Tchuvatch Eslovaco', 'Cão Lobo Checoslovaco',
  'Cão Lobo de Saarloos', 'Cão da Serra de Aires', 'Schipperke', 'Pastor Iugoslavo de Charplanina',

  // Grupo 2 – Pinscher, Schnauzer, Molossos e Boiadeiros Suíços
  'Pinscher Miniatura', 'Pinscher Alemão', 'Pinscher Austríaco', 'Affenpinscher', 'Dobermann',
  'Schnauzer Miniatura', 'Schnauzer Standard', 'Schnauzer Gigante', 'Smoushond Holandês',
  'Terrier Preto Russo', 'Boxer', 'Buldogue Inglês', 'Bullmastiff', 'Mastiff (Mastim Inglês)',
  'Dogue Alemão', 'Dogue de Bordeaux', 'Dogo Argentino', 'Dogo Canário (Presa Canário)', 'Fila Brasileiro',
  'Mastim Napolitano', 'Cane Corso', 'Mastim Espanhol', 'Mastim dos Pirenéus', 'Mastim Tibetano',
  'Tosa Inu', 'Shar-Pei', 'Rottweiler', 'Hovawart', 'Leonberger', 'Terra-Nova', 'São Bernardo',
  'Boiadeiro Bernês', 'Grande Boiadeiro Suíço', 'Boiadeiro de Appenzell', 'Boiadeiro de Entlebuch',
  'Cão da Montanha dos Pirenéus', 'Cão de Gado Transmontano', 'Cão da Serra da Estrela',
  'Rafeiro do Alentejo', 'Cão de Fila de São Miguel', 'Cão de Castro Laboreiro', 'Broholmer',
  'Landseer', 'Cão de Montanha do Atlas (Aidi)', 'Pastor da Anatólia (Kangal)', 'Pastor do Cáucaso',
  'Pastor da Ásia Central', 'Pastor do Carso', 'Tornjak', 'Dogo Maiorquino (Ca de Bou)',
  'Cão de Fazenda Dinamarquês-Sueco', 'Cimarrón Uruguaio',

  // Grupo 3 – Terriers
  'Airedale Terrier', 'Bedlington Terrier', 'Border Terrier', 'Fox Terrier de Pelo Liso',
  'Fox Terrier de Pelo Duro', 'Irish Terrier', 'Kerry Blue Terrier', 'Lakeland Terrier',
  'Manchester Terrier', 'Parson Russell Terrier', 'Jack Russell Terrier', 'Welsh Terrier',
  'Terrier Brasileiro (Fox Paulistinha)', 'Terrier Alemão de Caça (Jagdterrier)',
  'Irish Soft Coated Wheaten Terrier', 'Irish Glen of Imaal Terrier', 'Cairn Terrier',
  'Dandie Dinmont Terrier', 'Norfolk Terrier', 'Norwich Terrier', 'Scottish Terrier',
  'Sealyham Terrier', 'Skye Terrier', 'West Highland White Terrier', 'Terrier Japonês',
  'Terrier Checo (Cesky Terrier)', 'Australian Terrier', 'Silky Terrier Australiano', 'Yorkshire Terrier',
  'Toy Terrier Inglês', 'Bull Terrier', 'Bull Terrier Miniatura', 'Staffordshire Bull Terrier',
  'American Staffordshire Terrier',

  // Grupo 4 – Dachshunds
  'Dachshund (Teckel)', 'Dachshund Miniatura', 'Dachshund Kaninchen',

  // Grupo 5 – Spitz e tipo primitivo
  'Husky Siberiano', 'Malamute do Alasca', 'Samoieda', 'Cão da Groenlândia', 'Akita', 'Akita Americano',
  'Shiba', 'Shikoku', 'Kai', 'Kishu', 'Hokkaido', 'Spitz Japonês', 'Spitz Alemão Anão (Lulu da Pomerânia)',
  'Spitz Alemão Pequeno', 'Spitz Alemão Médio', 'Spitz Alemão Grande', 'Keeshond (Spitz Lobo)',
  'Volpino Italiano', 'Chow Chow', 'Eurasier', 'Jindo Coreano', 'Basenji', 'Cão do Faraó',
  'Podengo Português', 'Podenco Ibicenco', 'Podenco Canário', 'Cirneco do Etna',
  'Xoloitzcuintle (Pelado Mexicano)', 'Cão Pelado Peruano', 'Thai Ridgeback', 'Cão de Taiwan',
  'Spitz Finlandês', 'Laika da Sibéria Ocidental', 'Laika da Sibéria Oriental', 'Laika Russo-Europeu',
  'Elkhound Norueguês Cinza', 'Elkhound Norueguês Preto', 'Elkhound Sueco (Jämthund)',
  'Spitz de Norrbotten', 'Lundehund Norueguês', 'Buhund Norueguês', 'Vallhund Sueco', 'Lapphund Sueco',
  'Lapphund Finlandês', 'Pastor Lapão Finlandês', 'Cão de Pastor Islandês', 'Cão de Canaã',
  'Cão de Urso da Carélia', 'Kintamani-Bali',

  // Grupo 6 – Sabujos, farejadores e raças semelhantes
  'Beagle', 'Beagle-Harrier', 'Basset Hound', 'Bloodhound (Cão de Santo Humberto)', 'Foxhound Inglês',
  'Foxhound Americano', 'Harrier', 'Otterhound', 'Coonhound Preto e Castanho', 'Dálmata',
  'Rhodesian Ridgeback', 'Basset Artesiano Normando', 'Basset Azul da Gasconha', 'Basset Fulvo da Bretanha',
  'Pequeno Basset Griffon da Vendeia', 'Grande Basset Griffon da Vendeia', 'Grande Griffon da Vendeia',
  'Griffon Nivernais', 'Griffon Fulvo da Bretanha', 'Grande Azul da Gasconha', 'Pequeno Azul da Gasconha',
  'Ariégeois', 'Porcelaine', 'Poitevin', 'Billy', 'Grande Anglo-Francês Tricolor',
  'Grande Anglo-Francês Branco e Preto', 'Grande Anglo-Francês Branco e Laranja', 'Sabujo Espanhol',
  'Segugio Italiano', 'Segugio Maremmano', 'Sabujo de Hannover', 'Sabujo da Montanha da Baviera',
  'Dachsbracke Alpino', 'Dachsbracke da Vestfália', 'Drever', 'Hamiltonstövare', 'Schillerstövare',
  'Smålandsstövare', 'Sabujo Finlandês', 'Sabujo Norueguês (Dunker)', 'Haldenstøver', 'Hygenhund',
  'Sabujo Suíço', 'Pequeno Sabujo Suíço', 'Gonczy Polski', 'Ogar Polski', 'Sabujo Eslovaco',
  'Sabujo Transilvano', 'Sabujo Sérvio', 'Sabujo Tricolor Sérvio', 'Sabujo de Montenegro',
  'Sabujo de Ístria de Pelo Curto', 'Sabujo de Ístria de Pelo Duro', 'Sabujo de Posavaz',
  'Sabujo da Bósnia de Pelo Duro', 'Sabujo Grego', 'Sabujo Austríaco (Brandlbracke)',
  'Sabujo da Estíria de Pelo Duro', 'Sabujo do Tirol', 'Sabujo Estoniano', 'Sabujo Alemão',

  // Grupo 7 – Cães de aponte (Pointers e Setters)
  'Pointer Inglês', 'Setter Inglês', 'Setter Irlandês', 'Setter Irlandês Vermelho e Branco', 'Setter Gordon',
  'Braco Alemão de Pelo Curto', 'Braco Alemão de Pelo Duro (Drahthaar)', 'Braco Alemão de Pelo Longo',
  'Stichelhaar', 'Pudelpointer', 'Weimaraner', 'Braco Italiano', 'Spinone Italiano',
  'Braco Húngaro de Pelo Curto (Vizsla)', 'Braco Húngaro de Pelo Duro', 'Braco Francês tipo Gasconha',
  'Braco Francês tipo Pirenéus', 'Braco de Auvergne', 'Braco de Ariège', 'Braco de Bourbonnais',
  'Braco Saint-Germain', 'Braco Dinamarquês Antigo', 'Braco Eslovaco de Pelo Duro',
  'Perdigueiro Português', 'Perdigueiro de Burgos', 'Spaniel Bretão (Epagneul Bretão)', 'Epagneul Francês',
  'Epagneul Picardo', 'Epagneul Azul da Picardia', 'Epagneul de Pont-Audemer', 'Pequeno Münsterländer',
  'Grande Münsterländer', 'Drentsche Patrijshond', 'Stabyhoun', 'Griffon de Aponte de Pelo Duro (Korthals)',
  'Cesky Fousek',

  // Grupo 8 – Retrievers, levantadores e cães d'água
  'Labrador Retriever', 'Golden Retriever', 'Flat-Coated Retriever', 'Curly-Coated Retriever',
  'Chesapeake Bay Retriever', 'Nova Scotia Duck Tolling Retriever', 'Cocker Spaniel Inglês',
  'Cocker Spaniel Americano', 'Springer Spaniel Inglês', 'Springer Spaniel Galês', 'Clumber Spaniel',
  'Field Spaniel', 'Sussex Spaniel', "Spaniel d'Água Irlandês", "Spaniel d'Água Americano",
  "Cão d'Água Português", "Cão d'Água Espanhol", 'Lagotto Romagnolo', 'Barbet', "Cão d'Água Frisão (Wetterhoun)",
  'Kooikerhondje', 'Spaniel Alemão (Wachtelhund)',

  // Grupo 9 – Cães de companhia
  'Bichon Frisé', 'Maltês', 'Bichon Bolonhês', 'Bichon Havanês', 'Coton de Tuléar',
  'Pequeno Cão Leão (Löwchen)', 'Poodle Toy', 'Poodle Anão', 'Poodle Médio', 'Poodle Gigante',
  'Griffon de Bruxelas', 'Griffon Belga', 'Pequeno Brabançon', 'Cão de Crista Chinês', 'Lhasa Apso',
  'Shih Tzu', 'Spaniel Tibetano', 'Terrier Tibetano', 'Cavalier King Charles Spaniel', 'King Charles Spaniel',
  'Spaniel Japonês (Chin)', 'Pequinês', 'Papillon', 'Phalène', 'Kromfohrländer', 'Chihuahua de Pelo Curto',
  'Chihuahua de Pelo Longo', 'Buldogue Francês', 'Pug', 'Boston Terrier', 'Pequeno Cão Russo (Russkiy Toy)',
  'Rateiro de Praga',

  // Grupo 10 – Galgos (lebréus)
  'Galgo Afegão', 'Saluki', 'Borzoi (Galgo Russo)', 'Wolfhound Irlandês', 'Deerhound', 'Galgo Espanhol',
  'Greyhound (Galgo Inglês)', 'Whippet', 'Galgo Italiano (Pequeno Lebréu Italiano)', 'Galgo Húngaro',
  'Galgo Polonês', 'Sloughi', 'Azawakh',

  // Grupo 11 (CBKC) e raças populares não reconhecidas pela FCI
  'Buldogue Campeiro', 'Ovelheiro Gaúcho', 'Dogue Brasileiro', 'Pastor Garafiano', 'American Bully',
  'American Pit Bull Terrier', 'Buldogue Americano', 'Pastor Australiano Miniatura', 'Pastor Shiloh',
  'Bulldog Continental', 'Bolonka', 'Pinscher Mini (Pinscher 0, 1, 2)',
  'Spitz Alemão (Lulu)', 'Coonhound Redbone', 'Treeing Walker Coonhound', 'Rat Terrier',
  'Toy Fox Terrier', 'Boykin Spaniel', 'Pastor Inglês', 'Cão de Leopardo Catahoula', 'Plott Hound',
  'Bluetick Coonhound', 'Mountain Cur'
];

// Gatos: raças reconhecidas pelas principais associações felinas
// (FIFe, TICA, CFA e WCF), com os nomes mais usados no Brasil.
window.RACAS.Felino = [
  'SRD (Sem Raça Definida)',
  'Abissínio', 'American Bobtail', 'American Curl', 'American Wirehair', 'Angorá Turco',
  'Aphrodite Giant (Gato de Chipre)', 'Ashera', 'Asian (Asiático)', 'Australian Mist (Mist Australiano)',
  'Balinês', 'Bambino', 'Bengal', 'Birmanês (Burmese)', 'Bobtail Japonês', 'Bobtail das Curilas (Kurilian Bobtail)',
  'Bombay', 'Brasileiro de Pelo Curto', 'British Longhair', 'British Shorthair (Britânico de Pelo Curto)',
  'Burmilla', 'Chartreux', 'Chausie', 'Colorpoint Shorthair', 'Cornish Rex', 'Cymric', 'Devon Rex',
  'Donskoy (Don Sphynx)', 'Dragon Li (Li Hua)', 'Elf', 'Europeu de Pelo Curto', 'Exótico de Pelo Curto (Exotic)',
  'German Rex', 'Havana Brown', 'Highlander', 'Himalaio', 'Khao Manee', 'Korat', 'Lambkin', 'LaPerm',
  'Lykoi', 'Maine Coon', 'Manx', 'Mau Árabe', 'Mau Egípcio', 'Mekong Bobtail', 'Minskin', 'Minuet (Napoleon)',
  'Munchkin', 'Nebelung', 'Neva Masquerade', 'Norueguês da Floresta', 'Ocicat', 'Ojos Azules',
  'Oriental de Pelo Curto', 'Oriental de Pelo Longo', 'Persa', 'Peterbald', 'Pixie-bob', 'Ragamuffin',
  'Ragdoll', 'Russo Azul', 'Sagrado da Birmânia', 'Savannah', 'Scottish Fold', 'Scottish Straight',
  'Selkirk Rex', 'Serengeti', 'Siamês', 'Siberiano', 'Singapura', 'Skookum', 'Snowshoe', 'Sokoke',
  'Somali', 'Sphynx', 'Thai', 'Tiffany (Chantilly)', 'Tonquinês', 'Toybob', 'Toyger', 'Ucraniano Levkoy',
  'Usuri', 'York Chocolate', 'Highland Fold', 'Javanês', 'Ural Rex', 'Burmês Europeu', 'Seychellois',
  'Mandalay', 'Cheetoh', 'Van Turco'
];
