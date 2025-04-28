// Document templates functionality
  $(document).ready(function() {
    // Set up click handler for the "Koosta dokument" button in virtuaaltoimik modal
    $("#create-document-btn").off('click').on('click', function() {
      console.log("Koosta dokument button clicked");

      // Show document templates modal
      $("#document-templates-modal").removeClass("hidden");

      // Load templates
      loadDocumentTemplates();
    });

    // Close document templates modal handlers
    $("#close-document-templates-modal, #exit-templates-btn").on('click', function() {
      $("#document-templates-modal").addClass("hidden");
    });

    // Close modal when clicking backdrop
    $("#document-templates-backdrop").on('click', function() {
      $("#document-templates-modal").addClass("hidden");
    });

    // Prevent closing when clicking modal content
    $("#document-templates-modal .modal-content").on('click', function(e) {
      e.stopPropagation();
    });

    // Function to load document templates
    function loadDocumentTemplates() {
      // Show loading state
      $("#templates-table-body").html(`
        <tr>
          <td colspan="6" class="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
            <div class="flex justify-center items-center space-x-2">
              <div class="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Laadin dokumendipohjad...</span>
            </div>
          </td>
        </tr>
      `);

      // Hide empty and error states
      $("#templates-empty-state").addClass("hidden");
      $("#templates-error-state").addClass("hidden");

      // Call API to get document templates
      $.ajax({
        url: "/api/v1/table/document-templates",
        method: "GET",
        success: function(response) {
          console.log("Document templates response:", response);

          if (response.success) {
            // Check if there are templates
            if (response.templates && response.templates.length > 0) {
              // Render templates table
              renderTemplatesTable(response.templates);
            } else {
              // Show empty state
              $("#templates-table-body").empty();
              $("#templates-empty-state").removeClass("hidden");
            }
          } else {
            // Show error state
            $("#templates-table-body").empty();
            $("#templates-error-state").removeClass("hidden");
            $("#templates-error-message").text(response.error || "Proovige lehte värskendada");
          }
        },
        error: function(xhr, status, error) {
          console.error("Error loading document templates:", error);

          // Show error state
          $("#templates-table-body").empty();
          $("#templates-error-state").removeClass("hidden");
          $("#templates-error-message").text(error || "Võrgu viga");
        }
      });
    }

    // Function to render templates table
    function renderTemplatesTable(templates) {
      let tableHtml = '';

      templates.forEach(template => {
        // Determine icon based on file extension
        let icon = getFileIcon(template.extension);

        // Determine type display name
        let typeDisplay = getFileTypeDisplay(template.extension);

        tableHtml += `
          <tr class="hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer template-row" data-path="${escapeHtml(template.path)}">
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 text-center">
              ${icon}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
              ${escapeHtml(template.name)}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
              ${escapeHtml(typeDisplay)}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
              ${escapeHtml(template.formatted_size)}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
              ${escapeHtml(template.modified)}
            </td>
            <td class="px-3 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
              <div class="flex space-x-2">
                <button class="text-blue-500 hover:text-blue-700 dark:text-blue-400 use-template-btn" title="Kasuta" data-path="${escapeHtml(template.path)}">
                  <i class="fas fa-file-alt"></i>
                </button>
                <button class="text-green-500 hover:text-green-700 dark:text-green-400 preview-template-btn" title="Eelvaade" data-path="${escapeHtml(template.path)}">
                  <i class="fas fa-eye"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      // Update table body
      $("#templates-table-body").html(tableHtml);

      // Set up click handlers for template rows
      $(".template-row").on('click', function() {
        const path = $(this).data('path');
        selectTemplate(path);
      });

      // Set up action button click handlers
      $(".use-template-btn").on('click', function(e) {
        e.stopPropagation(); // Prevent row click
        const path = $(this).data('path');
        selectTemplate(path);
      });

      $(".preview-template-btn").on('click', function(e) {
        e.stopPropagation(); // Prevent row click
        const path = $(this).data('path');
        previewTemplate(path);
      });
    }

    // Function to select a template
    function selectTemplate(path) {
      // Highlight the selected template row
      $(".template-row").removeClass("bg-blue-50 dark:bg-blue-900");
      $(`.template-row[data-path="${escapeHtml(path)}"]`).addClass("bg-blue-50 dark:bg-blue-900");

      // Store selected template path for use with action buttons
      $("#document-templates-modal").data("selected-template", path);

      console.log("Selected template:", path);
    }

    // Function to preview a template
    function previewTemplate(path) {
      try {
        // Try to open the template directly
        window.open(`file:///${path}`, '_blank');
      } catch (e) {
        console.error("Error opening template:", e);
        showToast("Viga", "Malli eelvaate avamine ebaõnnestus", "error");
      }
    }

    // Template folder open button handler
    $("#open-templates-folder-btn").on('click', function() {
      const templatesDir = "C:\\Taitemenetlus\\uksikdokumendid\\dokumendipohjad";

      $.ajax({
        url: `/api/v1/table/open-folder/${encodeURIComponent(templatesDir)}`,
        method: "GET",
        success: function(response) {
          console.log("Open folder response:", response);
          if (response.success) {
            showToast("Kaust avatud", "Dokumendipohjad kaust avati edukalt", "success");
          } else {
            showToast("Viga", response.message || "Kausta avamine ebaõnnestus", "error");
          }
        },
        error: function(xhr, status, error) {
          console.error("Error opening folder:", error);
          showToast("Viga", "Kausta avamine ebaõnnestus", "error");
        }
      });
    });

    // Create document button handler
    $("#create-doc-btn").on('click', function() {
      const selectedTemplate = $("#document-templates-modal").data("selected-template");

      if (!selectedTemplate) {
        showToast("Viga", "Palun valige dokumendipõhi", "error");
        return;
      }

      // For now, just show a message - in a real implementation, this would create a new document
      showToast("Funktsioon arendamisel", "Dokumendi koostamise funktsioon on arendamisel", "info");

      // Typically, this would:
      // 1. Copy the template to a new location
      // 2. Open it for editing
      // 3. Possibly fill in some data from the selected toimik
    });

    // Other button handlers
    $("#drafts-btn").on('click', function() {
      showToast("Funktsioon arendamisel", "Mustandite funktsioon on arendamisel", "info");
    });

    $("#create-pdf-btn").on('click', function() {
      const selectedTemplate = $("#document-templates-modal").data("selected-template");

      if (!selectedTemplate) {
        showToast("Viga", "Palun valige dokumendipõhi", "info");
        return;
      }

      showToast("Funktsioon arendamisel", "PDF koostamise funktsioon on arendamisel", "info");
    });

    $("#edit-doc-btn").on('click', function() {
      const selectedTemplate = $("#document-templates-modal").data("selected-template");

      if (!selectedTemplate) {
        showToast("Viga", "Palun valige dokumendipõhi", "info");
        return;
      }

      showToast("Funktsioon arendamisel", "Dokumendi redigeerimise funktsioon on arendamisel", "info");
    });

    // Helper function to get file icon based on extension
    function getFileIcon(extension) {
      const iconMap = {
        '.pdf': '<i class="fas fa-file-pdf text-red-500"></i>',
        '.doc': '<i class="fas fa-file-word text-blue-500"></i>',
        '.docx': '<i class="fas fa-file-word text-blue-500"></i>',
        '.xls': '<i class="fas fa-file-excel text-green-500"></i>',
        '.xlsx': '<i class="fas fa-file-excel text-green-500"></i>',
        '.ppt': '<i class="fas fa-file-powerpoint text-orange-500"></i>',
        '.pptx': '<i class="fas fa-file-powerpoint text-orange-500"></i>',
        '.txt': '<i class="fas fa-file-alt text-gray-500"></i>',
        '.rtf': '<i class="fas fa-file-alt text-blue-400"></i>',
      };

      return iconMap[extension.toLowerCase()] || '<i class="fas fa-file text-gray-500"></i>';
    }

    // Helper function to get file type display name
    function getFileTypeDisplay(extension) {
      const typeMap = {
        '.pdf': 'PDF dokument',
        '.doc': 'Word dokument',
        '.docx': 'Word dokument',
        '.xls': 'Excel tabel',
        '.xlsx': 'Excel tabel',
        '.ppt': 'PowerPoint',
        '.pptx': 'PowerPoint',
        '.txt': 'Tekstifail',
        '.rtf': 'RTF dokument',
      };

      return typeMap[extension.toLowerCase()] || (extension ? extension.substring(1).toUpperCase() + ' fail' : 'Tundmatu fail');
    }

    // Helper function to escape HTML
    function escapeHtml(unsafe) {
      if (unsafe === null || unsafe === undefined) return '';
      return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }
  });