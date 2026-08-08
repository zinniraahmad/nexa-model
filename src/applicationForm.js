export const applicationSections = [
  {
    id: 'consent', eyebrow: 'SECTION 1', title: 'Intro & Consent', titleBm: 'Pengenalan & Persetujuan',
    description: 'Applicants must be between 18 and 30 years old and apply voluntarily.',
    descriptionBm: 'Pemohon mestilah berumur antara 18 hingga 30 tahun dan memohon secara sukarela.',
    fields: [
      { key: 'email', type: 'email', label: 'Email Address', labelBm: 'Alamat E-mel', required: true, maxLength: 254, autocomplete: 'email', placeholder: 'name@gmail.com' },
      { key: 'age_gate', type: 'radio', label: 'Are you aged 18 to 30 years old?', labelBm: 'Adakah anda berumur 18 hingga 30 tahun?', options: ['Yes', 'No'], required: true },
      { key: 'information_consent', type: 'checkbox', label: 'I have read and understood the information provided above.', labelBm: 'Saya telah membaca dan memahami maklumat yang diberikan.', options: ['I understand and agree to proceed.'], required: true },
      { key: 'voluntary_application', type: 'radio', label: 'Are you applying voluntarily for modelling opportunities through Nexa Model?', labelBm: 'Adakah anda memohon secara sukarela untuk peluang modelling melalui Nexa Model?', options: ['Yes', 'No'], required: true },
    ],
  },
  {
    id: 'basic', eyebrow: 'SECTION 2', title: 'Basic Information', titleBm: 'Maklumat Asas',
    description: 'Please provide your current personal and contact information.', descriptionBm: 'Sila berikan maklumat peribadi dan perhubungan terkini.',
    fields: [
      { key: 'full_name', type: 'text', label: 'Full Name', labelBm: 'Nama Penuh', required: true, maxLength: 100, autocomplete: 'name' },
      { key: 'preferred_name', type: 'text', label: 'Preferred Name / Nickname', labelBm: 'Nama Pilihan / Nama Panggilan' },
      { key: 'age', type: 'number', label: 'Age', labelBm: 'Umur', help: 'Applicants must be between 18 and 30 years old.', min: 18, max: 30, required: true },
      { key: 'gender', type: 'radio', label: 'Gender (female applicants only)', labelBm: 'Jantina (pemohon wanita sahaja)', options: ['Female'], required: true },
      { key: 'current_state', type: 'select', label: 'Current State', labelBm: 'Negeri Semasa', options: ['Kuala Lumpur','Selangor','Johor','Penang','Perak','Negeri Sembilan','Melaka','Pahang','Terengganu','Kelantan','Kedah','Perlis','Sabah','Sarawak','Putrajaya','Labuan'], required: true },
      { key: 'current_location', type: 'text', label: 'Current Location', labelBm: 'Lokasi Semasa', help: 'Example: Shah Alam, Selangor', required: true, maxLength: 100 },
      { key: 'phone', type: 'tel', label: 'WhatsApp / Contact Number', labelBm: 'Nombor WhatsApp / Telefon', required: true, maxLength: 30, autocomplete: 'tel' },
      { key: 'instagram', type: 'text', label: 'Instagram Username / Profile Link', labelBm: 'Username / Pautan Instagram', placeholder: '@username or instagram.com/username', required: true },
      { key: 'tiktok', type: 'text', label: 'TikTok Username / Profile Link', labelBm: 'Username / Pautan TikTok', placeholder: '@username or tiktok.com/@username', required: true },
      { key: 'other_portfolio_link', type: 'text', label: 'Other Portfolio / Social Media Link', labelBm: 'Pautan Portfolio / Media Sosial Lain', help: 'Example: https://portfolio.com/yourname', helpBm: 'Contoh: pautan portfolio atau profil media sosial', placeholder: 'https://...' },
    ],
  },
  {
    id: 'profile', eyebrow: 'SECTION 3', title: 'Modelling Profile', titleBm: 'Profil Modelling',
    description: 'Tell us about your experience, sizing and preferred photoshoot styles.', descriptionBm: 'Kongsikan pengalaman, saiz dan gaya photoshoot pilihan anda.',
    fields: [
      { key: 'height_cm', type: 'number', label: 'Height (cm)', labelBm: 'Ketinggian (cm)', min: 120, max: 220, required: true },
      { key: 'weight_kg', type: 'number', label: 'Weight (kg)', labelBm: 'Berat (kg)', min: 30, max: 200, required: true },
      { key: 'clothing_size', type: 'select', label: 'Usual Clothing Size', labelBm: 'Saiz Pakaian Biasa', options: ['XS','S','M','L'], required: true },
      { key: 'skin_tone', type: 'radio', label: 'Skin Tone', labelBm: 'Tona Kulit', options: ['Dark Skin Tone (Gelap)','Tan / Medium-Brown Skin Tone (Sawo Matang)','Warm Light Skin Tone (Kuning Langsat)','Fair / Light (Cerah)'], required: true },
      { key: 'body_type', type: 'radio', label: 'Body Type', labelBm: 'Bentuk Badan', options: ['Hourglass — bahu dan pinggul lebih kurang seimbang, pinggang lebih jelas.','Pear / Triangle — bahagian pinggul lebih lebar berbanding bahu.','Inverted Triangle — bahu lebih lebar berbanding pinggul.','Rectangle / Straight — bahu, pinggang dan pinggul nampak agak seimbang/lurus.','Apple / Round — bahagian tengah badan lebih dominan berbanding pinggul.'], required: true },
      { key: 'modelling_experience', type: 'radio', label: 'Do you have previous modelling experience?', labelBm: 'Adakah anda mempunyai pengalaman modelling?', options: ['Yes','No'], required: true },
      { key: 'experience_details', type: 'textarea', label: 'If yes, briefly describe your experience.', labelBm: 'Jika ya, terangkan pengalaman anda secara ringkas.' },
      { key: 'activewear_experience', type: 'radio', label: 'Have you modelled activewear, sportswear, yoga, Pilates or fitness outfits?', labelBm: 'Pernahkah anda memperagakan activewear, sportswear, yoga, Pilates atau pakaian fitness?', options: ['Yes','No'], required: true },
      { key: 'has_portfolio', type: 'radio', label: 'Do you currently have a modelling portfolio?', labelBm: 'Adakah anda mempunyai portfolio modelling?', options: ['Yes','No'], required: true },
      { key: 'portfolio_link', type: 'url', label: 'Portfolio Link', labelBm: 'Pautan Portfolio' },
      { key: 'photoshoot_styles', type: 'checkbox', label: 'Which photoshoot styles are you familiar with?', labelBm: 'Gaya photoshoot manakah yang anda biasa lakukan?', options: ['Casual / Lifestyle','Fashion','Sportswear / Activewear','Fitness','Yoga / Pilates','Product Modelling','Social Media Content','None / Complete Beginner','Other'], required: true },
      { key: 'posing_experience', type: 'scale', label: 'How would you rate your current posing experience?', labelBm: 'Bagaimana anda menilai pengalaman posing semasa?', min: 1, max: 5, minLabel: 'Complete Beginner', maxLabel: 'Very Experienced', required: true },
    ],
  },
  {
    id: 'poses', eyebrow: 'SECTION 4', title: 'Pose & Photoshoot Reference', titleBm: 'Rujukan Pose & Photoshoot',
    description: 'You may be asked to follow standing, side-angle, floor, movement and product-focused pose references. Guidance will be provided.', descriptionBm: 'Anda mungkin diminta mengikuti rujukan pose berdiri, sudut sisi, lantai, pergerakan dan fokus produk. Panduan akan diberikan.',
    fields: [
      { key: 'pose_comfort', type: 'radio', label: 'Are you comfortable performing similar types of poses?', labelBm: 'Adakah anda selesa melakukan pose yang serupa?', options: ['Yes, I am comfortable.','Yes, but I may need some guidance.','I am not sure yet.','No, I am not comfortable.'], required: true },
      { key: 'pose_boundaries', type: 'textarea', label: 'Are there any poses you are not comfortable performing?', labelBm: 'Adakah terdapat pose yang anda tidak selesa lakukan?' },
      { key: 'visual_reference_comfort', type: 'radio', label: 'Are you comfortable following visual pose references?', labelBm: 'Adakah anda selesa mengikuti rujukan visual pose?', options: ['Yes','Yes, with guidance','No'], required: true },
    ],
  },
  {
    id: 'rates', eyebrow: 'SECTION 5', title: 'Rates & Modelling Opportunities', titleBm: 'Kadar & Peluang Modelling',
    description: 'Estimated rates are shown on the introduction page. Final rates depend on campaign requirements, duration, usage and client arrangements.', descriptionBm: 'Anggaran kadar dipaparkan pada halaman pengenalan. Kadar akhir bergantung pada kempen, tempoh, penggunaan dan aturan client.',
    fields: [{ key: 'rates_acknowledged', type: 'checkbox', label: 'I have reviewed and understood the estimated modelling rates.', labelBm: 'Saya telah menyemak dan memahami anggaran kadar modelling.', options: ['I understand.'], required: true }],
  },
  {
    id: 'training', eyebrow: 'SECTION 6', title: 'Training & Assessment', titleBm: 'Latihan & Penilaian',
    description: 'Shortlisted candidates may complete approximately 3–4 real-time online sessions.', descriptionBm: 'Calon terpilih mungkin menjalani sekitar 3–4 sesi online secara real-time.',
    fields: [
      { key: 'training_willing', type: 'radio', label: 'Are you willing to participate in online training and assessment?', labelBm: 'Adakah anda bersedia menyertai latihan dan penilaian online?', options: ['Yes','No'], required: true },
      { key: 'home_training_comfort', type: 'radio', label: 'Are you comfortable completing it from home or another suitable location?', labelBm: 'Adakah anda selesa melakukannya dari rumah atau lokasi sesuai?', options: ['Yes','Yes, depending on the session requirements','No'], required: true },
      { key: 'feedback_comfort', type: 'radio', label: 'Are you comfortable receiving feedback and making adjustments?', labelBm: 'Adakah anda selesa menerima maklum balas dan membuat penambahbaikan?', options: ['Yes','Yes, with guidance','No'], required: true },
      { key: 'improvement_areas', type: 'checkbox', label: 'Which areas would you like to improve?', labelBm: 'Bahagian manakah yang ingin anda perbaiki?', options: ['Posing','Facial expression','Camera angles','Lighting','Photo composition','Confidence in front of the camera','Activewear / Fitness posing','Following pose references','Other'] },
      { key: 'previous_online_training', type: 'radio', label: 'Have you participated in online modelling training before?', labelBm: 'Pernahkah anda menyertai latihan modelling online?', options: ['Yes','No'] },
    ],
  },
  {
    id: 'equipment', eyebrow: 'SECTION 7', title: 'Equipment & Setup', titleBm: 'Peralatan & Persediaan',
    description: 'Professional equipment is not required for the initial training and assessment.', descriptionBm: 'Peralatan profesional tidak diperlukan untuk latihan dan penilaian awal.',
    fields: [
      { key: 'device_type', type: 'radio', label: 'What device will you mainly use?', labelBm: 'Peranti apakah yang akan anda gunakan?', options: ['iPhone','Android Phone','Digital Camera / Mirrorless / DSLR','Other'], required: true },
      { key: 'device_model', type: 'text', label: 'Phone or device model', labelBm: 'Model telefon atau peranti', required: true },
      { key: 'tripod', type: 'radio', label: 'Do you have your own tripod?', labelBm: 'Adakah anda mempunyai tripod?', options: ['Yes','No','Planning to get one','I may use another suitable support/setup'], required: true },
      { key: 'lighting_setup', type: 'checkbox', label: 'What lighting setup do you have access to?', labelBm: 'Apakah pencahayaan yang boleh anda gunakan?', options: ['Natural lighting / Window light','Ring light','LED / Video light','Studio lighting','No dedicated lighting equipment','Other'] },
      { key: 'capture_help', type: 'radio', label: 'How will your photos and videos usually be taken?', labelBm: 'Bagaimanakah gambar dan video anda akan diambil?', options: ['I will take the photos/videos myself','A friend or family member will help me','I have my own photographer','I plan to use or hire a photographer','I am not sure yet'], required: true },
      { key: 'photographer_use', type: 'radio', label: 'Will you use a photographer?', labelBm: 'Adakah anda akan menggunakan jurugambar?', options: ['Yes, I have my own photographer','Yes, but only for certain sessions','Maybe, depending on the session','No, I will manage myself or with someone I know'], required: true },
      { key: 'photographer_weekends', type: 'radio', label: 'Is the photographer generally available on weekends?', labelBm: 'Adakah jurugambar biasanya tersedia pada hujung minggu?', options: ['Yes','No','Depends on schedule','Not applicable'] },
    ],
  },
  {
    id: 'drive', eyebrow: 'SECTION 8', title: 'Training Submission', titleBm: 'Penghantaran Latihan',
    description: 'Training photos and videos will be submitted through a Google Drive folder provided to shortlisted candidates.', descriptionBm: 'Gambar dan video latihan akan dihantar melalui folder Google Drive untuk calon terpilih.',
    fields: [{ key: 'drive_upload_comfort', type: 'radio', label: 'Are you comfortable uploading to a Google Drive folder provided by Nexa Model?', labelBm: 'Adakah anda selesa memuat naik ke folder Google Drive yang diberikan oleh Nexa Model?', options: ['Yes','Yes, but I may need guidance','No'], required: true }],
  },
  {
    id: 'availability', eyebrow: 'SECTION 9', title: 'Availability', titleBm: 'Ketersediaan',
    description: 'Most training and assessment sessions are expected to take place during weekends.', descriptionBm: 'Kebanyakan sesi latihan dan penilaian dijangka berlangsung pada hujung minggu.',
    fields: [
      { key: 'weekend_availability', type: 'checkbox', label: 'When are you generally available during weekends?', labelBm: 'Bilakah anda biasanya tersedia pada hujung minggu?', options: ['Saturday Morning','Saturday Afternoon','Saturday Evening','Sunday Morning','Sunday Afternoon','Sunday Evening','My availability varies depending on the week'], required: true },
      { key: 'weekday_availability', type: 'radio', label: 'Are you available during weekdays if required?', labelBm: 'Adakah anda tersedia pada hari bekerja jika diperlukan?', options: ['Yes','Sometimes','No'], required: true },
      { key: 'preferred_session_time', type: 'checkbox', label: 'Preferred time for online sessions', labelBm: 'Masa pilihan untuk sesi online', options: ['Morning','Afternoon','Evening','Flexible'], required: true },
      { key: 'start_availability', type: 'radio', label: 'How soon can you begin if shortlisted?', labelBm: 'Bilakah anda boleh bermula jika terpilih?', options: ['Immediately','Within 1 week','Within 2 weeks','Within 1 month','Depends on my schedule'], required: true },
      { key: 'regular_commitments', type: 'textarea', label: 'Any regular commitments that may affect availability?', labelBm: 'Adakah komitmen tetap yang mungkin menjejaskan ketersediaan?' },
    ],
  },
]

export const declarationFields = [
  { key: 'privacy_notice_consent', type: 'checkbox', label: 'I have read and understood the Nexa Model Privacy Notice, including necessary processing by the named providers outside Malaysia.', labelBm: 'Saya telah membaca dan memahami Notis Privasi Nexa Model, termasuk pemprosesan yang diperlukan oleh penyedia yang dinamakan di luar Malaysia.', options: ['I understand and agree.'], required: true },
  { key: 'accurate_information', type: 'checkbox', label: 'I confirm that the information provided is accurate.', labelBm: 'Saya mengesahkan maklumat yang diberikan adalah tepat.', options: ['I confirm.'], required: true },
  { key: 'no_guarantee_acknowledged', type: 'checkbox', label: 'I understand that submission does not guarantee selection, training completion or an assignment.', labelBm: 'Saya memahami permohonan tidak menjamin pemilihan, tamat latihan atau tugasan.', options: ['I understand.'], required: true },
  { key: 'whatsapp_consent', type: 'checkbox', label: 'I consent to being contacted through WhatsApp.', labelBm: 'Saya bersetuju untuk dihubungi melalui WhatsApp.', options: ['Yes, I consent.'], required: true },
  { key: 'profile_sharing_consent', type: 'radio', label: 'May Nexa share your profile with suitable brands or clients for legitimate casting?', labelBm: 'Bolehkah Nexa berkongsi profil anda dengan jenama atau client untuk casting yang sah?', options: ['Yes, I consent.','No, I do not consent.'], required: true },
  { key: 'additional_notes', type: 'textarea', label: 'Anything else you would like Nexa Model to know?', labelBm: 'Ada perkara lain yang ingin anda maklumkan kepada Nexa Model?' },
]

export const photoFields = [
  { key: 'front_facing', label: 'Clear Front-Facing Photo', labelBm: 'Gambar Jelas Menghadap Hadapan', min: 1, max: 1, required: true },
  { key: 'side_profile', label: 'Side-Profile Photo', labelBm: 'Gambar Profil Sisi', min: 3, max: 3, required: true },
  { key: 'full_body_front', label: 'Full-Body Front Photo', labelBm: 'Gambar Seluruh Badan Dari Hadapan', min: 3, max: 3, required: true },
  { key: 'full_body_side', label: 'Full-Body Side Photo', labelBm: 'Gambar Seluruh Badan Dari Sisi', min: 3, max: 3, required: true },
  { key: 'casual_lifestyle', label: 'Recent Casual or Lifestyle Photos', labelBm: 'Gambar Casual atau Lifestyle Terkini', min: 3, max: 3, required: true },
  { key: 'portfolio', label: 'Previous Modelling or Portfolio Photos', labelBm: 'Gambar Modelling atau Portfolio Terdahulu', min: 3, max: 10, required: true },
  { key: 'activewear_portfolio', label: 'Existing Activewear / Sportswear Portfolio', labelBm: 'Portfolio Activewear / Sportswear Sedia Ada', min: 3, max: 3, required: true },
]
