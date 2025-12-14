"""
PDF Generation Service for Erection Methodology Documents
Generates professional PDF reports from methodology analysis data.
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, Image, ListFlowable, ListItem
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from io import BytesIO
from datetime import datetime
from typing import Dict, Any, List


def generate_methodology_pdf(document_data: Dict[str, Any]) -> BytesIO:
    """
    Generate a PDF document from methodology analysis data.
    Returns a BytesIO buffer containing the PDF.
    """
    buffer = BytesIO()

    # Create the PDF document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=25*mm,
        bottomMargin=25*mm
    )

    # Get styles
    styles = getSampleStyleSheet()

    # Custom styles
    styles.add(ParagraphStyle(
        name='DocTitle',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=30,
        textColor=colors.HexColor('#1e3a5f'),
        alignment=TA_CENTER
    ))

    styles.add(ParagraphStyle(
        name='SectionHeader',
        parent=styles['Heading1'],
        fontSize=16,
        spaceBefore=20,
        spaceAfter=10,
        textColor=colors.HexColor('#1e3a5f'),
        borderWidth=0,
        borderColor=colors.HexColor('#3b82f6'),
        borderPadding=5
    ))

    styles.add(ParagraphStyle(
        name='SubHeader',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=15,
        spaceAfter=8,
        textColor=colors.HexColor('#374151')
    ))

    # Modify existing BodyText style instead of adding a new one
    styles['BodyText'].fontSize = 10
    styles['BodyText'].spaceAfter = 6
    styles['BodyText'].alignment = TA_JUSTIFY

    styles.add(ParagraphStyle(
        name='Instruction',
        parent=styles['Normal'],
        fontSize=10,
        leftIndent=20,
        spaceAfter=4,
        bulletIndent=10
    ))

    # Build content
    content = []

    # Title Page
    content.append(Spacer(1, 50*mm))
    content.append(Paragraph("ERECTION METHODOLOGY", styles['DocTitle']))
    content.append(Spacer(1, 10*mm))

    # File info
    file_info = document_data.get('file_info', {})
    content.append(Paragraph(
        f"<b>Project File:</b> {file_info.get('file_name', 'Unknown')}",
        styles['BodyText']
    ))
    content.append(Paragraph(
        f"<b>Generated:</b> {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        styles['BodyText']
    ))
    content.append(Spacer(1, 20*mm))

    # Summary box
    summary = document_data.get('summary', {})
    summary_data = [
        ['Total Structural Elements', str(summary.get('total_elements', 0))],
        ['Erection Zones', str(summary.get('total_zones', 0))],
        ['Erection Stages', str(summary.get('total_stages', 0))],
        ['Building Levels', str(len(summary.get('levels', [])))],
        ['Grid System', 'Detected' if summary.get('grid_detected') else 'Virtual Grid Created'],
    ]

    summary_table = Table(summary_data, colWidths=[80*mm, 60*mm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f3f4f6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
    ]))
    content.append(summary_table)

    content.append(PageBreak())

    # Table of Contents
    content.append(Paragraph("TABLE OF CONTENTS", styles['SectionHeader']))
    content.append(Spacer(1, 5*mm))

    toc_items = [
        "1. Executive Summary",
        "2. Grid System Overview",
        "3. Erection Zones",
        "4. Erection Sequence",
        "5. Safety Notes",
    ]
    for item in toc_items:
        content.append(Paragraph(item, styles['BodyText']))

    content.append(PageBreak())

    # Section 1: Executive Summary
    content.append(Paragraph("1. EXECUTIVE SUMMARY", styles['SectionHeader']))
    content.append(Paragraph(
        f"This document outlines the erection methodology for the structural steel elements "
        f"contained in the IFC model <b>{file_info.get('file_name', 'Unknown')}</b>. "
        f"The analysis has identified {summary.get('total_elements', 0)} structural elements "
        f"organized into {summary.get('total_zones', 0)} erection zones with "
        f"{summary.get('total_stages', 0)} sequential erection stages.",
        styles['BodyText']
    ))
    content.append(Spacer(1, 5*mm))

    if summary.get('grid_detected'):
        content.append(Paragraph(
            "The IFC model contains a defined grid system which has been used to organize "
            "the erection zones. Elements have been mapped to grid cells based on their spatial positions.",
            styles['BodyText']
        ))
    else:
        content.append(Paragraph(
            "No IfcGrid was found in the model. A virtual grid system has been automatically "
            "generated based on the spatial distribution of structural elements.",
            styles['BodyText']
        ))

    content.append(Spacer(1, 10*mm))

    # Section 2: Grid System
    content.append(Paragraph("2. GRID SYSTEM OVERVIEW", styles['SectionHeader']))
    grid_system = document_data.get('grid_system', {})

    u_axes = grid_system.get('u_axes', [])
    v_axes = grid_system.get('v_axes', [])

    if u_axes or v_axes:
        content.append(Paragraph(
            f"The grid system consists of {len(u_axes)} primary axes (U-direction) and "
            f"{len(v_axes)} secondary axes (V-direction), creating "
            f"{len(grid_system.get('cells', []))} grid cells.",
            styles['BodyText']
        ))

        # Grid axes table
        if u_axes:
            content.append(Paragraph("Primary Axes (U-Direction):", styles['SubHeader']))
            axis_data = [['Axis Tag', 'Position (mm)']]
            for axis in u_axes[:20]:  # Limit to 20 axes
                axis_data.append([axis.get('tag', ''), f"{axis.get('position', 0):.0f}"])
            if len(u_axes) > 20:
                axis_data.append(['...', f"({len(u_axes) - 20} more)"])

            axis_table = Table(axis_data, colWidths=[40*mm, 50*mm])
            axis_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3b82f6')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
            ]))
            content.append(axis_table)
            content.append(Spacer(1, 5*mm))

    content.append(PageBreak())

    # Section 3: Erection Zones
    content.append(Paragraph("3. ERECTION ZONES", styles['SectionHeader']))
    zones = document_data.get('zones', [])

    content.append(Paragraph(
        f"The structure has been divided into {len(zones)} erection zones based on the grid system. "
        "Each zone represents a logical grouping of structural elements that can be erected as a unit.",
        styles['BodyText']
    ))
    content.append(Spacer(1, 5*mm))

    for zone in zones:
        content.append(Paragraph(f"Zone {zone.get('zone_id')}: {zone.get('name', 'Unnamed')}", styles['SubHeader']))

        zone_info = [
            f"<b>Grid Cells:</b> {', '.join(zone.get('grid_cells', [])[:10])}" +
            (f" (+{len(zone.get('grid_cells', [])) - 10} more)" if len(zone.get('grid_cells', [])) > 10 else ""),
            f"<b>Total Elements:</b> {zone.get('element_count', 0)}",
        ]

        element_counts = zone.get('element_counts', {})
        if element_counts:
            counts_str = ", ".join([f"{k.title()}: {v}" for k, v in element_counts.items()])
            zone_info.append(f"<b>Element Breakdown:</b> {counts_str}")

        for info in zone_info:
            content.append(Paragraph(info, styles['BodyText']))

        content.append(Spacer(1, 5*mm))

    content.append(PageBreak())

    # Section 4: Erection Sequence
    content.append(Paragraph("4. ERECTION SEQUENCE", styles['SectionHeader']))
    stages = document_data.get('erection_sequence', [])

    content.append(Paragraph(
        "The following erection sequence should be followed to ensure structural stability "
        "throughout the construction process. The sequence follows the standard practice of "
        "erecting columns first, followed by beams, and then bracing elements.",
        styles['BodyText']
    ))
    content.append(Spacer(1, 5*mm))

    for stage in stages:
        stage_title = f"Stage {stage.get('stage_id')}: {stage.get('name', 'Unnamed')}"
        content.append(Paragraph(stage_title, styles['SubHeader']))

        content.append(Paragraph(
            f"<b>Zone:</b> {stage.get('zone_name', 'Unknown')} | "
            f"<b>Element Type:</b> {stage.get('element_type', 'Unknown').title()} | "
            f"<b>Count:</b> {stage.get('element_count', 0)} elements",
            styles['BodyText']
        ))

        content.append(Paragraph(f"<b>Description:</b> {stage.get('description', '')}", styles['BodyText']))

        instructions = stage.get('instructions', [])
        if instructions:
            content.append(Paragraph("<b>Instructions:</b>", styles['BodyText']))
            for instruction in instructions:
                content.append(Paragraph(f"• {instruction}", styles['Instruction']))

        content.append(Spacer(1, 8*mm))

    content.append(PageBreak())

    # Section 5: Safety Notes
    content.append(Paragraph("5. SAFETY NOTES", styles['SectionHeader']))

    safety_notes = [
        "All erection work shall be carried out in accordance with applicable safety regulations and site-specific safety plans.",
        "Temporary bracing must be installed as required to maintain structural stability during erection.",
        "All bolted connections shall be snug-tightened during erection and fully torqued as per specification before proceeding to the next stage.",
        "Column plumbing and alignment must be verified before proceeding with beam installation.",
        "Weather conditions must be monitored, and erection suspended during high winds or adverse conditions.",
        "All lifting operations shall be planned and executed by qualified riggers and crane operators.",
        "Workers at height must use appropriate fall protection equipment at all times.",
        "Daily safety briefings should be conducted before commencement of erection activities.",
    ]

    for note in safety_notes:
        content.append(Paragraph(f"• {note}", styles['BodyText']))

    content.append(Spacer(1, 20*mm))

    # Footer
    content.append(Paragraph(
        f"<i>Document generated automatically from IFC model analysis on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</i>",
        ParagraphStyle(
            name='Footer',
            parent=styles['Normal'],
            fontSize=8,
            textColor=colors.gray,
            alignment=TA_CENTER
        )
    ))

    # Build the PDF
    doc.build(content)

    buffer.seek(0)
    return buffer
