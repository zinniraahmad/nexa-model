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

    // Applicant submission
    if (url.pathname === "/api/apply" && request.method === "POST") {
      try {
        const body = await request.json();
        const fullName = String(body.full_name ?? "").trim();
        const email = String(body.email ?? "").trim().toLowerCase();
        const phone = String(body.phone ?? "").trim();
        const location = String(body.current_location ?? "").trim();

        if (!fullName || fullName.length > 100 || !email || email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || phone.length > 30 ||
            !location || location.length > 100) {
          return Response.json({ success: false, error: "Please provide valid information in every field." }, { status: 400 });
        }
        const applicationId = crypto.randomUUID();

        await env.DB
          .prepare(`
            INSERT INTO applicants (
              application_id,
              full_name,
              email,
              phone,
              current_location
            )
            VALUES (?, ?, ?, ?, ?)
          `)
          .bind(
            applicationId,
            fullName,
            email,
            phone,
            location
          )
          .run();

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

    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      return Response.json(
        { success: false, error: "Photo must be a JPG, PNG or WebP under 10 MB." },
        { status: 400 }
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
