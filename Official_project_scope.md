# Grounded AI for Road Maintenance Decisions: Evaluating Retrieval Quality and Failure Modes

## DSCI 591 Capstone

- Syllabus
- Selected Proposals
- Hackathon
- Info & Schedule
- Teamwork Documents
- Deliverables
  1. Proposal Presentation & Report
     - 1b. Presentation Schedule

## On this page

- Organizational details
  - Your name
  - Your position in the organization
  - Organization name
  - Organization website
  - Organization address
  - About your organization
- Problem formulation
- Data information
- Logistics

---

## Organizational details

### Your name

Mostafa Nakhaei

### Your position in the organization

CTO

### Organization name

PavePal Technologies Inc.

### Organization website

https://www.pavepal.ai/

### Organization address

410 W Georgia St, Vancouver, BC V6B 1Z3

### About your organization

*Please write a short description about your organization. This description should be a 2-4 sentence, high-level overview.*

PavePal is a road assesment platform that enable user to proactively manintain their road network by implementing computer vision. We detect road defects and road assets by high accuraacy and desire frequency based on customer requirement.

---

## Problem formulation

### Description of the problem/question

*Please write a description about the data problem/question your organization is challenged with. The more details provided here, the better understanding we will have of your data problem/question. Please use accessible language without domain-specific jargon. Limit your response to 500 words.*

*Note: If your problem/question leads to multiple projects, please submit a proposal for each project.*

Road maintenance decisions depend on both data (such as inspection results and defect records) and guidance (such as engineering manuals, standards, and best-practice documents). While large language models (LLMs) make it possible to query information in natural language, their usefulness in safety- and cost-sensitive domains depends heavily on how well they retrieve, ground, and explain information from underlying data sources.

Our organization works with structured road inspection data (for example, detected defects, severity, location, and time) alongside unstructured public documents such as pavement maintenance manuals and engineering guidelines. A growing challenge is determining how to reliably combine these heterogeneous data sources so that AI-generated recommendations are accurate, transparent, and trustworthy.

Rather than building a full conversational assistant, this project focuses on a more fundamental question:

> "How well can an AI system retrieve and ground relevant information from multiple data sources to support road maintenance decisions, and where does it fail?"

The project will explore a retrieval-augmented data pipeline that connects:

a. Structured datasets (e.g., defect records, severity metrics)
b. Unstructured documents (e.g., manuals, standards, guidance text)
c. Optional contextual data sources (e.g., simplified traffic or weather indicators)

Students will evaluate how different retrieval strategies affect:

1. Relevance of retrieved information
2. Consistency between structured data and textual guidance
3. Transparency of recommendations (can sources be clearly traced?)
4. Common failure modes such as missing context, conflicting guidance, or unsupported conclusions

The goal is not to automate decisions, but to understand the strengths and limits of AI-assisted retrieval in a real-world infrastructure context.

### Problem/question impact

*Describe how this problem/question impacts your organization. Limit your response to 250 words.*

This problem directly affects whether AI can be responsibly integrated into infrastructure decision-making. While AI-generated recommendations can improve efficiency, poor retrieval or unclear reasoning can reduce trust and introduce risk.

For our organization, understanding retrieval quality and failure modes is critical before deploying AI-assisted features to users. Without this understanding:

a. Recommendations may be incomplete or misleading
b. Users may not know which data or documents informed an answer
c. Errors may be hard to detect or explain

By focusing on evaluation and transparency, this project helps ensure that future AI features are defensible, auditable, and trustworthy. It also informs product decisions about which data sources add value, where guardrails are needed, and when human oversight is required.

### Problem/question keywords

*Please select the problem/question keyword(s) that best describe the work required for this project (you may select more than one). - Selected Choice*

- Descriptive (e.g., you wish to summarize characteristics of a dataset)
- Exploratory (e.g., you wish to generate new hypotheses to test in the future)
- Inferential/explanatory (e.g., you wish to try to explain patterns or relationships in your dataset and generalize them to the larger population)
- Causal (e.g., you wish to establish a directional effect of one, or more, variables on another)

*Please select the problem/question keyword(s) that best describe the work required for this project (you may select more than one). - Other - Text*

This question was left blank in the application form

---

## Data information

### Summary of available data sources

*Please write a short summary description of the data that will be provided to the students for the project. This description should be a 2-4 sentence, high-level overview. More detailed questions will follow.*

The project will use structured road inspection data collected by the organization, including detected defects, severity indicators, and timestamps. It will also use publicly available pavement maintenance manuals and engineering guidance documents. Optional contextual datasets (such as simplified traffic or weather summaries) may be included to test multi-source retrieval scenarios.

### Detailed dataset description

*Describe the subjects of the dataset (e.g., sensitive data about people, data about places and objects, synthetically generated data) as well as the variables/features recorded for the dataset subjects. An annotated snapshot of the dataset could be used to answer this question.*

The project uses a combination of structured, unstructured, and derived data.

Structured data includes records describing road defects, with variables such as defect type, severity level, inspection date, and road context. These datasets represent physical infrastructure assets rather than people.

Unstructured data includes public technical documents such as pavement maintenance manuals, standards, and best-practice guidelines. These documents will be segmented into text chunks and enriched with metadata to support retrieval experiments.

Derived datasets may include:

a. Embeddings or indexing structures for document retrieval
b. Reference mappings between defect types and relevant document sections
c. Synthetic queries and expected reference answers for evaluation

### Dataset sensitive attributes

*For any data sources that will be used for the project, please describe any human and other sensitive attributes. If no attributes are sensitive, please write "Not applicable".*

Not applicable. The datasets do not include personal or identifiable human data.

### Dataset provenance

*For any data sources that will be used for the project, please describe the methods of how the data were collected (e.g., API, surveys, scraped or crawled, artificially generated, etc).*

Inspection data is collected internally using vehicle-mounted cameras and computer vision systems, then stored in structured tabular form. Public documents are sourced from openly available government and industry publications.

### Dataset readiness

*For any data sources that will be used for the project, please indicate when the dataset will be ready for the project.*

A curated subset of structured inspection data and selected public documents will be available before the start of the capstone project. Preprocessing steps such as document segmentation and basic indexing will be completed early in the project timeline.

### Data product

*Please write a description about the data product that will help your organization overcome the described problem, or answer the described question. Limit your response to 500 words.*

*Examples of possible data products include:*

1. *A dashboard, such as a Shiny or Dash app, to explore an aspect of your data*
2. *An R or Python package with documentation to simplify an analysis*
3. *A data pipeline that includes some data science model*
4. *A technical report outlining student findings*

The data product will be a research-oriented evaluation framework for AI-assisted retrieval in road maintenance decision support.

The product will include:

1. A multi-source retrieval pipeline connecting structured defect data and unstructured documents
2. A set of representative decision-support queries (e.g., repair recommendations, prioritization questions)
3. Quantitative and qualitative evaluation of retrieval relevance, grounding, and consistency
4. Analysis of failure modes, including hallucinations, missing evidence, and conflicting sources

Deliverables may take the form of:

a. A technical report documenting system design, evaluation metrics, and findings
b. Visualizations showing retrieval coverage and error patterns
3. A lightweight prototype demonstrating how retrieved evidence supports or fails to support a recommendation

The emphasis is on evaluation, transparency, and interpretability, not on deploying a user-facing conversational system.

### Data product impact

*Describe how such a data product would positively impact your organization. Limit your response to 250 words.*

This data product provides critical insight into how AI systems behave when combining structured infrastructure data with technical documents. It helps our organization understand where AI adds value and where it introduces risk.

Key impacts include:

1. Improved confidence in future AI-assisted features
2. Clear identification of data gaps and retrieval limitations
3. Better design decisions around explainability and user trust
4. A strong foundation for responsible AI deployment

For the organization, this work reduces uncertainty around AI adoption while advancing internal knowledge on retrieval quality and system reliability.

### Data product keywords

*Please select any data product keywords below that are relevant to this project. - Selected Choice*

- Data engineering
- Generative artificial intelligence
- Hypothesis testing
- Inferential modelling
- Natural language processing
- Supervised machine learning
- Unsupervised machine learning/Clustering

*Please select any data product keywords below that are relevant to this project. - Other - Text*

This question was left blank in the application form

---

## Logistics

### Additional computing resources

*Describe the computing resources needed to complete the proposed project. If they are beyond the standard laptop students will be equipped with (details here), describe how your organization will provide these resources to the students. If no additional computing resources are needed beyond that of the students' standard laptop, please write "Not applicable".*

Not Applicable

### Are you an UBC-affiliated sponsor?

*Sponsors who hold any type of UBC appointment (e.g. clinicians with teaching appointments) or startups that have strong relationships to UBC (e.g. currently "incubating" within e@UBC, Hatch, etc.; or with directors who are UBC faculty/staff).*

No

### This project will require the UBC mutual non-disclosure agreement (NDA)

Yes

### This project will require the UBC IP assignment agreement

Yes

### I confirm that I have shown the UBC template documents to our legal counsel and gotten their agreement to use these documents

I agree

### This project will require the handling of confidentiality and IP through UBC's UILO

This question was left blank in the application form

### Additional security requirements

*Is there anything else that students will be required to do to work on this project (e.g., complete a background check, etc)? If there are no additional security requirements, please write "Not applicable".*

Not applicable

### Student communication of work

*We understand that you may require some restrictions to be put in place, but we also would like for our students to have some freedom to talk about the work they've done, particularly when applying for jobs. We want our students to know about these restrictions up-front so that they can make an informed decision about the projects they choose.*

*How do you anticipate students will be able to share aspects of their work with others? Examples can include listing the project on their resume, discussing it in a private job interview, writing a blog post about the experience, open-sourcing the code they write, etc.*

Students are allowed to include listing the project on their resume, discussing it in a private job interview

### Potential conflicts of interests

*Do you have any potential conflicts of interest to declare? For example, if a current MDS student or family member is involved with your organization on a professional or personal level, this should be declared along with a short explanation. These situations are generally not problematic, but we prefer to disclose them to the students before they rank the projects. If there are no conflicts of interest, please write "Not applicable".*

Not applicable

### Space for students at your organization

*Do you have space available for students to work on site?*

No

### Do you give us permission to use the problem statement in this proposal for future teaching purposes, to help our students practice framing data science problems? We greatly appreciate your support in helping our students learn and grow.

No

### Do you anticipate having data scientist job opening(s) after the project?

Yes

### How did you hear about the UBC MDS Capstone program?

Refferal
