Promp Architecture

    PromptSet
    	- PromptSetId
    	- Name
    	
    Prompt
    	- PromptId
    	- Name
    	- PromptSetId
    	- PromptTypeId (static with values Assessment, Audit, System. Create table PromptType with columns PromptTypeId, Description)
    	
    PromptSection
    	- PromptSectionId
    	- PromptId
    	- Title
    	- Content
    	- Sequence (order from 1)
		
	
Assement Architecture

	Assement
		- AssementId
		- Description
		- CreatedDate
		- UpdatedDate 
		- CreatedBy (user id)
		- AssementStatusId (static with values, New, In-progress, Failed, Complete. Create table (AssessmentStatus with columns AssessmentStatusId, decription))
		- PromptSetId
		
	AssessmentSection
		- AssessmentSectionId
		- AssessmentId
		- PromptSectionId
		- Title
		- Content
		- AssessmentSectionStatusId (static with values, New, In-progress, Failed, Complete. Create table (AssessmentSectionStatus with columns id, decription))
		- Sequence (order from 1)	
		
	AssesmentFile
		- AssesmentFileId
		- AssementId
		- AssessmentFileTypeId (static values 'Financial Statement', 'Rating Report', create AssessmentFileType table with id, Description)
		- FileName
		- MimeType
		- FilePath (to supabase container or something)
		- CreatedDate
		- IsExampleFile
		
	AssessmentLogs
		- AssessmentLogId
		- AssementId
		- Message
		- CreatedDate
		
		
	AssessmentComparison
		- AssessmentComparisonId
		- CreatedDate
		- CreatedBy
		
	AssessmentComparisonAssessment
		- AssessmentComparisonId
		- AssessmentId
		
	AssessmentComparisonSection
		- AssessmentComparisonSectionId
		- Not sure what else to add but I need some commentary about the sections being compared. By default if both assessments have the same section, compare each. If they are different, let user pick which to compare
		
		
		
NB: All id should be intergers from 1
		