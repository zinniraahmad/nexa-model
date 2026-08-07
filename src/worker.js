export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
    }

    // DB test
    if (url.pathname === "/api/db-test") {
      const result = await env.DB
        .prepare("SELECT 1 AS ok")
        .first();

      return Response.json({
        database: "connected",
        result
      });
    }

    // Prevent repeat applications using the same email address
    if (url.pathname === "/api/check-email" && request.method === "POST") {
      try {
        const body = await request.json();
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
          return Response.json({ success: false, error: "Please enter a valid email address." }, { status: 400 });
        }
        const applicant = await env.DB
          .prepare("SELECT application_id FROM applicants WHERE LOWER(email) = LOWER(?) LIMIT 1")
          .bind(email)
          .first();
        return Response.json({ success: true, exists: Boolean(applicant) });
      } catch (error) {
        console.error("Email check failed", error);
        return Response.json({ success: false, error: "Unable to verify email address." }, { status: 500 });
      }
    }

    // Applicant submission
    if (url.pathname === "/api/apply" && request.method === "POST") {
      try {
        const body = await request.json();
        const answers = body.answers && typeof body.answers === "object" ? body.answers : body;
        const fullName = String(body.full_name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        const phone = String(body.phone ?? "").trim();
        const location = String(body.current_location ?? "").trim();
        const responsesJson = JSON.stringify(answers);

        if (!fullName || fullName.length > 100 || !email || email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email) || !phone || phone.length > 30 ||
            !location || location.length > 100 || responsesJson.length > 100000) {
          return Response.json({ success: false, error: "Please provide valid information in every field." }, { status: 400 });
        }

        const applicantAge = Number(answers.age);
        if (body.answers && (answers.age_gate !== "Yes" || answers.voluntary_application !== "Yes" ||
            !Number.isFinite(applicantAge) || applicantAge < 18 || applicantAge > 30 || answers.gender !== "Female" ||
            !answers.accurate_information?.length ||
            !answers.no_guarantee_acknowledged?.length || !answers.whatsapp_consent?.length)) {
          return Response.json({ success: false, error: "Required declarations are incomplete." }, { status: 400 });
        }
        const existingApplicant = await env.DB
          .prepare("SELECT application_id FROM applicants WHERE LOWER(email) = LOWER(?) LIMIT 1")
          .bind(email)
          .first();
        if (existingApplicant) {
          return Response.json(
            { success: false, already_submitted: true, error: "An application has already been submitted with this email address." },
            { status: 409 }
          );
        }
        const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
        const randomBytes = crypto.getRandomValues(new Uint8Array(3));
        const shortCode = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
        const applicationId = `NEXA-${dateStamp}-${shortCode}`;

        const applicantInsert = env.DB.prepare(`
            INSERT INTO applicants (
              application_id,
              full_name,
              email,
              phone,
              current_location
            )
            VALUES (?, ?, ?, ?, ?)
          `).bind(
            applicationId,
            fullName,
            email,
            phone,
            location
          );

        if (body.answers) {
          const detailsInsert = env.DB.prepare(`
            INSERT INTO applicant_details (
              application_id,
              responses_json,
              application_status
            ) VALUES (?, ?, 'submitted')
          `).bind(applicationId, responsesJson);
          await env.DB.batch([applicantInsert, detailsInsert]);
        } else {
          await applicantInsert.run();
        }

        return Response.json(
          {
            success: true,
            application_id: applicationId
          },
          { status: 201 }
        );
      } catch (error) {
        console.error("Application submission failed", error);
        return Response.json(
          {
            success: false,
            error: "Unable to submit application"
          },
          { status: 500 }
        );
      }
    }

    // ImageKit upload test
    if (url.pathname === "/api/upload" && request.method === "POST") {
  try {
    const formData = await request.formData();

    const file = formData.get("file");
    const applicationId = formData.get("application_id");
    const photoType = formData.get("photo_type") ?? null;

    if (!file || !applicationId) {
      return Response.json(
        {
          success: false,
          error: "file and application_id are required"
        },
        { status: 400 }
      );
    }

    if (!(file instanceof File) || !/\.(png|jpe?g|raw)$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      return Response.json(
        { success: false, error: "Photo must be a PNG, JPG, JPEG or RAW image under 10 MB." },
        { status: 400 }
      );
    }

    if (typeof photoType !== "string" || !/^[a-z0-9_]{1,80}$/.test(photoType)) {
      return Response.json({ success: false, error: "Invalid photo category." }, { status: 400 });
    }

    const duplicatePhoto = await env.DB
      .prepare(`
        SELECT file_id
        FROM applicant_photos
        WHERE application_id = ? AND LOWER(file_name) = LOWER(?)
        LIMIT 1
      `)
      .bind(applicationId, file.name)
      .first();

    if (duplicatePhoto) {
      return Response.json(
        { success: false, error: "A photo with this filename has already been uploaded for this application." },
        { status: 409 }
      );
    }

    if (!env.IMAGEKIT_PRIVATE_KEY) {
      console.error("IMAGEKIT_PRIVATE_KEY is not configured");
      return Response.json({ success: false, error: "Photo service is not configured." }, { status: 503 });
    }

    const applicant = await env.DB
      .prepare(`
        SELECT application_id
        FROM applicants
        WHERE application_id = ?
      `)
      .bind(applicationId)
      .first();

    if (!applicant) {
      return Response.json(
        {
          success: false,
          error: "Applicant not found"
        },
        { status: 404 }
      );
    }

    const uploadForm = new FormData();

    uploadForm.append("file", file);
    uploadForm.append(
      "fileName",
      file.name || `photo-${Date.now()}.jpg`
    );

    uploadForm.append(
      "folder",
      `/nexa/applicants/${applicationId}`
    );

    const auth = btoa(`${env.IMAGEKIT_PRIVATE_KEY}:`);

    const response = await fetch(
      "https://upload.imagekit.io/api/v1/files/upload",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`
        },
        body: uploadForm
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          error: "Image provider rejected the upload."
        },
        { status: response.status }
      );
    }

    await env.DB
      .prepare(`
        INSERT INTO applicant_photos (
          application_id,
          file_id,
          file_name,
          file_url,
          photo_type
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        applicationId,
        result.fileId,
        result.name,
        result.url,
        photoType
      )
      .run();

    return Response.json({
      success: true,
      application_id: applicationId,
      file_id: result.fileId,
      file_name: result.name,
      file_url: result.url
    });
  } catch (error) {
    console.error("Photo upload failed", error);
    return Response.json(
      {
        success: false,
        error: "Upload failed"
      },
      { status: 500 }
    );
  }
}

    // React frontend
    return env.ASSETS.fetch(request);
  }
};
