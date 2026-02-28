CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reference" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_line_item" (
	"id" text PRIMARY KEY NOT NULL,
	"sale_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_discount_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount_type" text,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_by_id" text,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance" ALTER COLUMN "pay_period_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery" ALTER COLUMN "customer_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery" ALTER COLUMN "assigned_to_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "list_price" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_item" ADD CONSTRAINT "sale_line_item_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_line_item" ADD CONSTRAINT "sale_line_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_id_idx" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_read_idx" ON "notification" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notification_created_at_idx" ON "notification" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_sale_id_idx" ON "payment" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_line_item_sale_id_idx" ON "sale_line_item" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sale_line_item_product_id_idx" ON "sale_line_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sale_status_idx" ON "sale" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sale_created_by_id_idx" ON "sale" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "sale_created_at_idx" ON "sale" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_employee_id_idx" ON "attendance" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "attendance_pay_period_id_idx" ON "attendance" USING btree ("pay_period_id");--> statement-breakpoint
CREATE INDEX "attendance_status_idx" ON "attendance" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_target_user_id_idx" ON "audit_log" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "delivery_status_idx" ON "delivery" USING btree ("status");--> statement-breakpoint
CREATE INDEX "delivery_assigned_to_user_id_idx" ON "delivery" USING btree ("assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "delivery_created_at_idx" ON "delivery" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "delivery_status_update_delivery_id_idx" ON "delivery_status_update" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "delivery_status_update_created_at_idx" ON "delivery_status_update" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "employee_user_id_idx" ON "employee" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "employee_email_idx" ON "employee" USING btree ("email");--> statement-breakpoint
CREATE INDEX "employee_active_idx" ON "employee" USING btree ("active");--> statement-breakpoint
CREATE INDEX "payroll_run_pay_period_id_idx" ON "payroll_run" USING btree ("pay_period_id");--> statement-breakpoint
CREATE INDEX "payroll_run_status_idx" ON "payroll_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payslip_payroll_run_id_idx" ON "payslip" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "payslip_employee_id_idx" ON "payslip" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payslip_status_idx" ON "payslip" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_category_idx" ON "product" USING btree ("category");--> statement-breakpoint
CREATE INDEX "product_archived_idx" ON "product" USING btree ("archived");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_movement_product_id_idx" ON "stock_movement" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_movement_created_at_idx" ON "stock_movement" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stock_movement_type_idx" ON "stock_movement" USING btree ("type");--> statement-breakpoint
CREATE INDEX "user_role_user_id_idx" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role_role_id_idx" ON "user_role" USING btree ("role_id");--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_user_id_unique" UNIQUE("user_id");